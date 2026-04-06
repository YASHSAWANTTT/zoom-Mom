import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useZoomSdk } from '../../contexts/ZoomSdkContext';
import { useToast } from '../../contexts/ToastContext';
import Button from '../../components/ui/Button';
import {
  buildClassroomMessage,
  ClassroomMessageType,
} from '../../protocol/classroomMessages';
import { LAST_MEETING_KEY } from './PostClassSummary';
import { useMomentumHostState } from './useMomentumHostState';
import { useMomentumSync } from './useMomentumSync';
import { useZoomSpotlight } from './useZoomSpotlight';
import LiveAnchorColumn from './LiveAnchorColumn';
import GlossaryTab from './GlossaryTab';
import TriviaView from './TriviaView';
import PollView from './PollView';
import './momentum.css';

const TOPIC_INTERVAL_MS = 120000;
const CUE_INTERVAL_MS = 90000;

export default function MomentumPanel({ meetingId, latestSegmentTimeMs }) {
  const { isAuthenticated } = useAuth();
  const { zoomSdk, meetingContext, isTestMode } = useZoomSdk();
  const { addToast } = useToast();

  const role = meetingContext?.role;
  const isHostLike = role === 'host' || role === 'coHost';

  const participantKey =
    meetingContext?.participantUUID ||
    meetingContext?.participantID ||
    meetingContext?.userName ||
    'me';

  const { state, dispatch, getSerializableState } = useMomentumHostState();
  const stateRef = useRef(state);
  const lastPollPayloadRef = useRef(null);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const [questionMarks, setQuestionMarks] = useState([]);
  const [missedBanner, setMissedBanner] = useState(null);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);

  const [hostPollQuestion, setHostPollQuestion] = useState('');
  const [hostPollOptions, setHostPollOptions] = useState(['', '', '', '']);

  const onStudentQuestionMark = useCallback((data) => {
    setQuestionMarks((m) =>
      [...m, { ts: data.tStartMs || Date.now(), name: data.name }].slice(-25)
    );
  }, []);

  const onLocalMark = useCallback((mark) => {
    setQuestionMarks((m) => [...m, mark].slice(-25));
  }, []);

  const onCueBookmark = useCallback(
    async (tStartMs) => {
      if (!meetingId) return;
      try {
        await fetch('/api/class/bookmarks', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            meetingId,
            tStartMs,
            source: 'auto_cue',
          }),
        });
        addToast('Bookmark saved (professor cue)', 'success');
      } catch {
        addToast('Could not save cue bookmark', 'error');
      }
    },
    [meetingId, addToast]
  );

  const getPollOptionLabels = useCallback(
    () => lastPollPayloadRef.current?.options || stateRef.current?.poll?.options,
    []
  );

  const { send } = useMomentumSync({
    isHostLike,
    dispatch,
    getSerializableState,
    onStudentQuestionMark,
    onCueBookmark,
    getPollOptionLabels,
    triviaRoundId: state.triviaRoundId,
  });

  useZoomSpotlight({
    zoomSdk,
    isTestMode,
    enabled: isAuthenticated && isHostLike,
    isHostLike,
    send,
    onLocalMark,
  });

  useEffect(() => {
    if (!isHostLike) return undefined;
    const t = setInterval(async () => {
      try {
        const res = await fetch('/api/ai/topic-segment', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ meetingId }),
        });
        if (!res.ok) return;
        const data = await res.json();
        const a = data.analysis;
        if (!a) return;

        const entry = {
          id: Date.now(),
          title: a.currentTopic || 'Topic',
          bullets: a.previousTopicSummary || [],
          currentTopic: a.currentTopic,
        };
        if ((a.topicChanged && entry.bullets?.length) || (a.currentTopic && a.previousTopicSummary?.length)) {
          dispatch({ type: 'TOPIC_PUSH', payload: entry });
          send(buildClassroomMessage(ClassroomMessageType.TOPIC_UPDATE, { entry }));
        }
        const terms = {};
        (a.glossary || []).forEach((g) => {
          if (g.term) terms[g.term] = g.definition || '';
        });
        if (Object.keys(terms).length) {
          dispatch({
            type: 'GLOSSARY_MERGE',
            payload: { terms, formulas: a.formulas },
          });
          send(
            buildClassroomMessage(ClassroomMessageType.GLOSSARY_UPDATE, {
              terms,
              formulas: a.formulas,
            })
          );
        }
      } catch {
        /* ignore */
      }
    }, TOPIC_INTERVAL_MS);
    return () => clearInterval(t);
  }, [isHostLike, meetingId, dispatch, send]);

  useEffect(() => {
    if (!isHostLike) return undefined;
    const t = setInterval(async () => {
      try {
        const res = await fetch('/api/ai/detect-cues', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ meetingId }),
        });
        if (!res.ok) return;
        const j = await res.json();
        if (j.cueDetected) {
          const tStart = latestSegmentTimeMs || Date.now();
          send(
            buildClassroomMessage(ClassroomMessageType.CUE_BOOKMARK, { tStartMs: tStart })
          );
        }
      } catch {
        /* ignore */
      }
    }, CUE_INTERVAL_MS);
    return () => clearInterval(t);
  }, [isHostLike, meetingId, send, latestSegmentTimeMs]);

  useEffect(() => {
    if (isHostLike || !state.topicHistory?.length) return;
    const titles = state.topicHistory.slice(-3).map((t) => t.title || t.currentTopic).filter(Boolean);
    if (titles.length) {
      setMissedBanner(`You joined late — recent topics: ${titles.join(' · ')}`);
    }
  }, [isHostLike, state.topicHistory]);

  const handleConfused = useCallback(async () => {
    const tStart = latestSegmentTimeMs || Date.now();
    setBookmarkLoading(true);
    try {
      const res = await fetch('/api/class/bookmarks', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId,
          tStartMs: tStart,
          source: 'manual',
        }),
      });
      if (res.ok) addToast('Bookmark saved', 'success');
      else addToast('Could not save bookmark', 'error');
    } catch {
      addToast('Could not save bookmark', 'error');
    } finally {
      setBookmarkLoading(false);
    }
  }, [meetingId, latestSegmentTimeMs, addToast]);

  const startTrivia = async () => {
    try {
      const res = await fetch('/api/ai/quiz-generate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId, count: 5 }),
      });
      if (!res.ok) {
        addToast('Quiz generation failed', 'error');
        return;
      }
      const data = await res.json();
      const questions = data.questions || [];
      const roundId = `r-${Date.now()}`;
      dispatch({
        type: 'TRIVIA_SET',
        payload: { questions, roundId },
      });
      send(
        buildClassroomMessage(ClassroomMessageType.START_TRIVIA, {
          questions,
          roundId,
        })
      );
      await fetch('/api/class/quizzes', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId,
          title: `Trivia ${new Date().toLocaleTimeString()}`,
          questions,
        }),
      }).catch(() => {});
      addToast('Trivia started', 'success');
    } catch {
      addToast('Quiz generation failed', 'error');
    }
  };

  const onTriviaAnswer = useCallback(
    (payload) => {
      send(
        buildClassroomMessage(ClassroomMessageType.ARENA_ANSWER, {
          ...payload,
          participantKey,
        })
      );
    },
    [send, participantKey]
  );

  const onPollVote = useCallback(
    (payload) => {
      send(
        buildClassroomMessage(ClassroomMessageType.POLL_RESPONSE, {
          ...payload,
          participantKey,
        })
      );
    },
    [send, participantKey]
  );

  const onStartPoll = () => {
    const options = hostPollOptions.map((s) => s.trim()).filter(Boolean);
    const q = hostPollQuestion.trim();
    if (!q || options.length < 2) {
      addToast('Add a question and at least two options', 'error');
      return;
    }
    const pollId = `p-${Date.now()}`;
    const payload = { pollId, question: q, options };
    lastPollPayloadRef.current = payload;
    send(buildClassroomMessage(ClassroomMessageType.POLL_START, payload));
    setHostPollQuestion('');
    setHostPollOptions(['', '', '', '']);
    addToast('Poll launched', 'success');
  };

  const glossaryTerms = useMemo(() => state.glossary || {}, [state.glossary]);

  useEffect(() => {
    if (!meetingId) return;
    try {
      sessionStorage.setItem(LAST_MEETING_KEY, meetingId);
    } catch {
      /* ignore */
    }
  }, [meetingId]);

  if (!meetingId) {
    return <p className="momentum-muted">Join a meeting to use Momentum.</p>;
  }

  return (
    <div className="momentum-panel">
      {missedBanner && (
        <div className="momentum-banner" role="status">
          {missedBanner}
        </div>
      )}

      <div className="momentum-banner">
        {isHostLike ? 'Host controls' : 'Student view'} · Role: {role || 'unknown'}
      </div>

      <div className="momentum-grid momentum-grid--split">
        <div>
          <LiveAnchorColumn
            topicHistory={state.topicHistory}
            questionMarks={questionMarks}
            isHostLike={isHostLike}
            onConfused={handleConfused}
            confusedLoading={bookmarkLoading}
          />
        </div>
        <div>
          <div className="momentum-section-title">Glossary</div>
          <GlossaryTab glossary={glossaryTerms} formulas={state.formulas} />
        </div>
      </div>

      {isHostLike && (
        <div className="momentum-host-actions">
          <Button type="button" size="sm" variant="secondary" onClick={startTrivia}>
            Start trivia
          </Button>
        </div>
      )}

      <div className="momentum-section-title">Warm-up arena</div>
      <TriviaView
        questions={state.trivia}
        roundId={state.triviaRoundId}
        isHostLike={isHostLike}
        leaderboard={state.leaderboard}
        participantKey={participantKey}
        onAnswer={onTriviaAnswer}
      />

      <div className="momentum-section-title">Professor&apos;s pulse</div>
      <PollView
        poll={state.poll}
        pollResults={state.pollResults}
        isHostLike={isHostLike}
        participantKey={participantKey}
        onVote={onPollVote}
        hostPollQuestion={hostPollQuestion}
        hostPollOptions={hostPollOptions}
        setHostPollQuestion={setHostPollQuestion}
        setHostPollOptions={setHostPollOptions}
        onStartPoll={onStartPoll}
      />
    </div>
  );
}
