const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const config = require('../config');
const { requireAuth, optionalAuth, devAuthBypass } = require('../middleware/auth');
const rollingBuffer = require('../services/rollingBuffer');
const {
  generateSummary,
  generateTitle,
  extractActionItems,
  chatWithTranscript,
  extractSOAPNotes,
  analyzeSentiment,
  analyzeTopicSegment,
  generateQuizQuestions,
  detectProfessorCues,
  generateRecoverySegment,
} = require('../services/openrouter');

// Apply dev auth bypass at router level (must run before requireAuth/optionalAuth)
router.use(devAuthBypass);

/**
 * Helper: Find meeting by database ID or Zoom meeting ID
 * Handles URL-encoded Zoom meeting UUIDs (e.g., %2F -> /, %3D -> =)
 */
async function findMeeting(meetingId, ownerId) {
  const ownerFilter = ownerId ? { ownerId } : {};

  // First try by database ID (UUID format)
  let meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, ...ownerFilter },
  });

  // If not found, try by Zoom meeting ID (unique)
  if (!meeting) {
    meeting = await prisma.meeting.findFirst({
      where: { zoomMeetingId: meetingId, ...ownerFilter },
    });
  }

  // If still not found, try URL-decoded version
  // Zoom meeting UUIDs contain base64 chars (/, +, =) that may be URL-encoded
  if (!meeting) {
    try {
      const decoded = decodeURIComponent(meetingId);
      if (decoded !== meetingId) {
        meeting = await prisma.meeting.findFirst({
          where: { zoomMeetingId: decoded, ...ownerFilter },
        });
      }
    } catch {
      // Invalid URI component, ignore
    }
  }

  return meeting;
}

/** Meeting lookup without owner check (students + host for classroom AI) */
async function findMeetingAny(meetingId) {
  return findMeeting(meetingId, null);
}

/**
 * Helper: Get transcript text for a meeting
 */
async function getTranscriptText(meetingId) {
  const segments = await prisma.transcriptSegment.findMany({
    where: { meetingId },
    orderBy: { seqNo: 'asc' },
    include: { speaker: true },
    take: 500,
  });

  if (segments.length === 0) {
    return null;
  }

  // Format as readable transcript
  return segments
    .map((seg) => {
      const speaker = seg.speaker?.displayName || seg.speaker?.label || 'Speaker';
      return `[${speaker}]: ${seg.text}`;
    })
    .join('\n');
}

/**
 * POST /api/ai/summary
 * Generate meeting summary
 */
router.post('/summary', requireAuth, async (req, res) => {
  const { meetingId } = req.body;

  if (!config.aiEnabled) {
    return res.status(503).json({ error: 'AI features are disabled' });
  }

  if (!meetingId) {
    return res.status(400).json({ error: 'meetingId is required' });
  }

  try {
    // Get meeting details (supports both database ID and Zoom meeting ID)
    const meeting = await findMeeting(meetingId, req.user.id);

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    // Get transcript text using the database ID
    const transcript = await getTranscriptText(meeting.id);

    if (!transcript) {
      return res.status(400).json({ error: 'No transcript available for this meeting' });
    }

    // Check for cached summary first
    if (meeting.summary) {
      return res.json({
        meetingId: meeting.id,
        title: meeting.title,
        summary: meeting.summary,
        cached: true,
      });
    }

    console.log(`🤖 Generating summary for meeting: ${meeting.title}`);

    // Generate summary
    const summary = await generateSummary(transcript, meeting.title);

    // Cache the summary
    try {
      await prisma.meeting.update({
        where: { id: meeting.id },
        data: { summary },
      });
    } catch (cacheErr) {
      console.warn('Failed to cache summary:', cacheErr.message);
    }

    res.json({
      meetingId: meeting.id,
      title: meeting.title,
      summary,
    });
  } catch (error) {
    console.error('❌ Summary generation error:', error.message);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});

/**
 * POST /api/ai/action-items
 * Extract action items from meeting
 */
router.post('/action-items', requireAuth, async (req, res) => {
  const { meetingId } = req.body;

  if (!config.aiEnabled) {
    return res.status(503).json({ error: 'AI features are disabled' });
  }

  if (!meetingId) {
    return res.status(400).json({ error: 'meetingId is required' });
  }

  try {
    // Get meeting details (supports both database ID and Zoom meeting ID)
    const meeting = await findMeeting(meetingId, req.user.id);

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    // Get transcript text using the database ID
    const transcript = await getTranscriptText(meeting.id);

    if (!transcript) {
      return res.status(400).json({ error: 'No transcript available for this meeting' });
    }

    console.log(`🤖 Extracting action items for meeting: ${meeting.title}`);

    // Extract action items
    const actionItems = await extractActionItems(transcript);

    res.json({
      meetingId: meeting.id,
      title: meeting.title,
      actionItems,
    });
  } catch (error) {
    console.error('❌ Action items extraction error:', error.message);
    res.status(500).json({ error: 'Failed to extract action items' });
  }
});

/**
 * POST /api/ai/extract-soap
 * Extract SOAP notes from healthcare transcript (healthcare vertical)
 */
router.post('/extract-soap', requireAuth, async (req, res) => {
  const { meetingId, transcript, currentSoap } = req.body;

  if (!config.aiEnabled) {
    return res.status(503).json({ error: 'AI features are disabled' });
  }

  if (!transcript) {
    return res.status(400).json({ error: 'transcript is required' });
  }

  try {
    console.log(`🏥 Extracting SOAP notes for meeting: ${meetingId || 'live'}`);

    // Extract SOAP notes using AI
    const soapNotes = await extractSOAPNotes(transcript, currentSoap || {});

    res.json(soapNotes);
  } catch (error) {
    console.error('❌ SOAP extraction error:', error.message);
    res.status(500).json({ error: 'Failed to extract SOAP notes' });
  }
});

/**
 * POST /api/ai/chat
 * Chat with transcripts (RAG-based Q&A)
 */
router.post('/chat', requireAuth, async (req, res) => {
  const { meetingId, question } = req.body;

  if (!config.aiEnabled) {
    return res.status(503).json({ error: 'AI features are disabled' });
  }

  if (!question) {
    return res.status(400).json({ error: 'question is required' });
  }

  try {
    let transcript = '';
    let meetingTitle = 'Meeting';

    if (meetingId) {
      // Chat about specific meeting (supports both database ID and Zoom meeting ID)
      const meeting = await findMeeting(meetingId, req.user.id);

      if (!meeting) {
        return res.status(404).json({ error: 'Meeting not found' });
      }

      meetingTitle = meeting.title;
      transcript = await getTranscriptText(meeting.id);

      if (!transcript) {
        return res.status(400).json({ error: 'No transcript available for this meeting' });
      }
    } else {
      // Chat across all meetings - get recent transcripts
      const recentMeetings = await prisma.meeting.findMany({
        where: { ownerId: req.user.id },
        orderBy: { startTime: 'desc' },
        take: 5,
        include: {
          segments: {
            orderBy: { seqNo: 'asc' },
            include: { speaker: true },
          },
        },
      });

      if (recentMeetings.length === 0) {
        return res.status(400).json({ error: 'No meetings with transcripts found' });
      }

      // Combine transcripts from recent meetings
      transcript = recentMeetings
        .map((m) => {
          const text = m.segments
            .map((seg) => {
              const speaker = seg.speaker?.displayName || seg.speaker?.label || 'Speaker';
              return `[${speaker}]: ${seg.text}`;
            })
            .join('\n');
          return `--- Meeting: ${m.title} (${m.startTime.toLocaleDateString()}) ---\n${text}`;
        })
        .join('\n\n');

      meetingTitle = 'Recent Meetings';
    }

    console.log(`🤖 Chat question: "${question.substring(0, 50)}..."`);

    // Get AI response
    const answer = await chatWithTranscript(question, transcript, meetingTitle);

    res.json({
      meetingId: meetingId || null,
      question,
      answer,
    });
  } catch (error) {
    console.error('❌ Chat error:', error.message);
    res.status(500).json({ error: 'Failed to process question' });
  }
});

/**
 * POST /api/ai/generate-title
 * Generate a descriptive meeting title from transcript or summary
 */
router.post('/generate-title', requireAuth, async (req, res) => {
  const { meetingId } = req.body;

  if (!config.aiEnabled) {
    return res.status(503).json({ error: 'AI features are disabled' });
  }

  if (!meetingId) {
    return res.status(400).json({ error: 'meetingId is required' });
  }

  try {
    const meeting = await findMeeting(meetingId, req.user.id);

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    // Prefer summary (shorter/cheaper) over full transcript
    let content;
    if (meeting.summary?.overview) {
      content = meeting.summary.overview;
      if (meeting.summary.keyPoints?.length) {
        content += '\n' + meeting.summary.keyPoints.join('\n');
      }
    } else {
      content = await getTranscriptText(meeting.id);
      if (!content) {
        return res.status(400).json({ error: 'No transcript available for this meeting' });
      }
    }

    console.log(`🤖 Generating title for meeting: ${meeting.title}`);

    const title = await generateTitle(content, meeting.title);

    res.json({ title });
  } catch (error) {
    console.error('❌ Title generation error:', error.message);
    res.status(500).json({ error: 'Failed to generate title' });
  }
});

// Rate limit: one suggest call per meeting per 5 minutes
const suggestRateLimit = new Map();

/**
 * POST /api/ai/suggest
 * Get real-time AI suggestions during meeting (for in-meeting use)
 */
router.post('/suggest', optionalAuth, async (req, res) => {
  const { meetingId, recentTranscript } = req.body;

  if (!config.aiEnabled) {
    return res.status(503).json({ error: 'AI features are disabled' });
  }

  if (!recentTranscript) {
    return res.status(400).json({ error: 'recentTranscript is required' });
  }

  // Rate limit per meeting
  if (meetingId) {
    const lastCall = suggestRateLimit.get(meetingId);
    if (lastCall && Date.now() - lastCall < 300000) {
      return res.status(429).json({ error: 'Too many requests. Wait 5 minutes.' });
    }
    suggestRateLimit.set(meetingId, Date.now());
  }

  try {
    const { generateSuggestions } = require('../services/openrouter');

    const suggestions = await generateSuggestions(recentTranscript);

    res.json({ suggestions });
  } catch (error) {
    console.error('Suggest error:', error.message);
    // Fall back to empty suggestions on error
    res.json({ suggestions: [] });
  }
});

/**
 * POST /api/ai/topic-segment
 * Professor mode: topic change + glossary from rolling buffer (~300 words)
 */
router.post('/topic-segment', requireAuth, async (req, res) => {
  const { meetingId, text: bodyText } = req.body;

  if (!config.aiEnabled) {
    return res.status(503).json({ error: 'AI features are disabled' });
  }

  try {
    let text = typeof bodyText === 'string' ? bodyText.trim() : '';

    if (!text && meetingId) {
      const meeting = await findMeetingAny(meetingId);
      if (!meeting) {
        return res.status(404).json({ error: 'Meeting not found' });
      }
      text = rollingBuffer.getText(meeting.zoomMeetingId);
      if (!text) {
        text = (await getTranscriptText(meeting.id)) || '';
        const words = text.split(/\s+/).filter(Boolean);
        text = words.slice(-rollingBuffer.MAX_WORDS).join(' ');
      }
    }

    if (!text) {
      return res.status(400).json({ error: 'Provide text or meetingId with live or saved transcript' });
    }

    const analysis = await analyzeTopicSegment(text);
    res.json({ analysis, wordCount: text.split(/\s+/).filter(Boolean).length });
  } catch (error) {
    console.error('topic-segment error:', error.message);
    res.status(500).json({ error: 'Failed to analyze topic' });
  }
});

/**
 * POST /api/ai/quiz-generate
 * Build multiple-choice questions from meeting transcript
 */
router.post('/quiz-generate', requireAuth, async (req, res) => {
  const { meetingId, count } = req.body;

  if (!config.aiEnabled) {
    return res.status(503).json({ error: 'AI features are disabled' });
  }

  if (!meetingId) {
    return res.status(400).json({ error: 'meetingId is required' });
  }

  const n = Math.min(Math.max(parseInt(count, 10) || 5, 1), 10);

  try {
    const meeting = await findMeeting(meetingId, req.user.id);
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    const transcript = await getTranscriptText(meeting.id);
    if (!transcript) {
      return res.status(400).json({ error: 'No transcript available for this meeting' });
    }

    const questions = await generateQuizQuestions(transcript, n);
    res.json({ meetingId: meeting.id, questions });
  } catch (error) {
    console.error('quiz-generate error:', error.message);
    res.status(500).json({ error: 'Failed to generate quiz' });
  }
});

/**
 * POST /api/ai/detect-cues
 * Scan recent text for professor emphasis cues
 */
router.post('/detect-cues', requireAuth, async (req, res) => {
  const { meetingId, text: bodyText } = req.body;

  if (!config.aiEnabled) {
    return res.status(503).json({ error: 'AI features are disabled' });
  }

  try {
    let text = typeof bodyText === 'string' ? bodyText.trim() : '';
    if (!text && meetingId) {
      const meeting = await findMeetingAny(meetingId);
      if (!meeting) {
        return res.status(404).json({ error: 'Meeting not found' });
      }
      text = rollingBuffer.getText(meeting.zoomMeetingId);
    }
    if (!text) {
      return res.status(400).json({ error: 'text or meetingId with buffer required' });
    }

    const result = await detectProfessorCues(text);
    res.json(result);
  } catch (error) {
    console.error('detect-cues error:', error.message);
    res.status(500).json({ error: 'Failed to detect cues' });
  }
});

/**
 * POST /api/ai/recovery-pack
 * Post-class explanations for class bookmarks (manual + auto_cue)
 */
router.post('/recovery-pack', requireAuth, async (req, res) => {
  const { meetingId, bookmarkIds } = req.body;

  if (!config.aiEnabled) {
    return res.status(503).json({ error: 'AI features are disabled' });
  }

  if (!meetingId) {
    return res.status(400).json({ error: 'meetingId is required' });
  }

  try {
    const meeting = await findMeetingAny(meetingId);
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    const where = {
      meetingId: meeting.id,
      userId: req.user.id,
      ...(Array.isArray(bookmarkIds) && bookmarkIds.length
        ? { id: { in: bookmarkIds } }
        : {}),
    };

    const bookmarks = await prisma.classBookmark.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    const items = [];
    for (const bm of bookmarks) {
      const t0 = bm.tStartMs;
      const windowMs = BigInt(90000);
      const segments = await prisma.transcriptSegment.findMany({
        where: {
          meetingId: meeting.id,
          tStartMs: { gte: t0 - windowMs, lte: t0 + windowMs },
        },
        orderBy: { seqNo: 'asc' },
        take: 40,
      });
      const snippet = segments.map((s) => s.text).join(' ');
      const recovery = await generateRecoverySegment(snippet || '(no transcript near bookmark)');
      items.push({
        bookmarkId: bm.id,
        tStartMs: bm.tStartMs.toString(),
        source: bm.source,
        recovery,
      });
    }

    res.json({ meetingId: meeting.id, items });
  } catch (error) {
    console.error('recovery-pack error:', error.message);
    res.status(500).json({ error: 'Failed to build recovery pack' });
  }
});

/**
 * GET /api/ai/status
 * Check AI service status
 */
router.get('/status', (req, res) => {
  res.json({
    enabled: config.aiEnabled,
    hasApiKey: !!(config.openaiApiKey || config.openrouterApiKey),
    provider: config.openaiApiKey ? 'openai' : 'openrouter',
    defaultModel: config.defaultModel,
    fallbackModel: config.fallbackModel,
  });
});

/**
 * POST /api/ai/sentiment
 * Analyze sentiment of customer speech using AI
 * Used for real-time customer sentiment tracking in support calls
 */
router.post('/sentiment', optionalAuth, async (req, res) => {
  const { text } = req.body;

  if (!config.aiEnabled) {
    return res.status(503).json({ error: 'AI features are disabled' });
  }

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'text is required' });
  }

  try {
    const result = await analyzeSentiment(text.trim());
    res.json(result);
  } catch (error) {
    console.error('❌ Sentiment analysis error:', error.message);
    res.status(500).json({ error: 'Sentiment analysis failed' });
  }
});

module.exports = router;
