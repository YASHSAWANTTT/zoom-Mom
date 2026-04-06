const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { requireAuth, devAuthBypass } = require('../middleware/auth');

router.use(devAuthBypass);

/**
 * Resolve meeting by DB id or Zoom meeting UUID (any participant context)
 */
async function findMeetingByKey(meetingId) {
  let meeting = await prisma.meeting.findFirst({ where: { id: meetingId } });
  if (!meeting) {
    meeting = await prisma.meeting.findFirst({ where: { zoomMeetingId: meetingId } });
  }
  if (!meeting) {
    try {
      const decoded = decodeURIComponent(meetingId);
      if (decoded !== meetingId) {
        meeting = await prisma.meeting.findFirst({ where: { zoomMeetingId: decoded } });
      }
    } catch {
      /* ignore */
    }
  }
  return meeting;
}

/**
 * Enforce host/owner for operations like saving a class-wide quiz
 */
async function findOwnedMeeting(meetingId, ownerId) {
  let meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, ownerId },
  });
  if (!meeting) {
    meeting = await prisma.meeting.findFirst({
      where: { zoomMeetingId: meetingId, ownerId },
    });
  }
  if (!meeting) {
    try {
      const decoded = decodeURIComponent(meetingId);
      if (decoded !== meetingId) {
        meeting = await prisma.meeting.findFirst({
          where: { zoomMeetingId: decoded, ownerId },
        });
      }
    } catch {
      /* ignore */
    }
  }
  return meeting;
}

/**
 * POST /api/class/bookmarks
 * Body: { meetingId, tStartMs, notes?, source?: 'manual' | 'auto_cue' }
 */
router.post('/bookmarks', requireAuth, async (req, res) => {
  const { meetingId, tStartMs, notes, source } = req.body;

  if (!meetingId || tStartMs === undefined || tStartMs === null) {
    return res.status(400).json({ error: 'meetingId and tStartMs are required' });
  }

  const meeting = await findMeetingByKey(meetingId);
  if (!meeting) {
    return res.status(404).json({ error: 'Meeting not found' });
  }

  const src = source === 'auto_cue' ? 'auto_cue' : 'manual';
  const t = BigInt(Math.trunc(Number(tStartMs)));

  try {
    const bookmark = await prisma.classBookmark.create({
      data: {
        meetingId: meeting.id,
        userId: req.user.id,
        tStartMs: t,
        source: src,
        notes: notes || null,
      },
    });
    res.status(201).json({
      id: bookmark.id,
      meetingId: meeting.id,
      tStartMs: bookmark.tStartMs.toString(),
      source: bookmark.source,
      notes: bookmark.notes,
      createdAt: bookmark.createdAt,
    });
  } catch (err) {
    console.error('class bookmark create:', err.message);
    res.status(500).json({ error: 'Failed to save bookmark' });
  }
});

/**
 * GET /api/class/bookmarks?meetingId=
 */
router.get('/bookmarks', requireAuth, async (req, res) => {
  const { meetingId } = req.query;
  if (!meetingId || typeof meetingId !== 'string') {
    return res.status(400).json({ error: 'meetingId query required' });
  }

  const meeting = await findMeetingByKey(meetingId);
  if (!meeting) {
    return res.status(404).json({ error: 'Meeting not found' });
  }

  const rows = await prisma.classBookmark.findMany({
    where: { meetingId: meeting.id, userId: req.user.id },
    orderBy: { createdAt: 'desc' },
  });

  res.json({
    meetingId: meeting.id,
    bookmarks: rows.map((b) => ({
      id: b.id,
      tStartMs: b.tStartMs.toString(),
      source: b.source,
      notes: b.notes,
      createdAt: b.createdAt,
    })),
  });
});

/**
 * POST /api/class/quizzes
 * Body: { meetingId, title?, questions }
 */
router.post('/quizzes', requireAuth, async (req, res) => {
  const { meetingId, title, questions } = req.body;

  if (!meetingId || questions === undefined) {
    return res.status(400).json({ error: 'meetingId and questions are required' });
  }

  const meeting = await findOwnedMeeting(meetingId, req.user.id);
  if (!meeting) {
    return res.status(404).json({ error: 'Meeting not found' });
  }

  try {
    const quiz = await prisma.quiz.create({
      data: {
        meetingId: meeting.id,
        title: title || 'Quiz',
        questions,
        createdById: req.user.id,
      },
    });
    res.status(201).json({
      id: quiz.id,
      meetingId: meeting.id,
      title: quiz.title,
      questions: quiz.questions,
      createdAt: quiz.createdAt,
    });
  } catch (err) {
    console.error('quiz create:', err.message);
    res.status(500).json({ error: 'Failed to save quiz' });
  }
});

/**
 * GET /api/class/quizzes/:meetingId
 * Readable by any authenticated user in the class (students + host)
 */
router.get('/quizzes/:meetingId', requireAuth, async (req, res) => {
  const { meetingId } = req.params;

  const meeting = await findMeetingByKey(meetingId);
  if (!meeting) {
    return res.status(404).json({ error: 'Meeting not found' });
  }

  const quizzes = await prisma.quiz.findMany({
    where: { meetingId: meeting.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  res.json({
    meetingId: meeting.id,
    quizzes: quizzes.map((q) => ({
      id: q.id,
      title: q.title,
      questions: q.questions,
      createdAt: q.createdAt,
    })),
  });
});

module.exports = router;
