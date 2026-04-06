import { useCallback, useEffect, useRef } from 'react';
import useZoomMessaging from '../../hooks/useZoomMessaging';
import {
  buildClassroomMessage,
  ClassroomMessageType,
} from '../../protocol/classroomMessages';

/**
 * @param {object} opts
 * @param {boolean} opts.isHostLike
 * @param {function} opts.dispatch
 * @param {() => object} opts.getSerializableState
 * @param {(data: object) => void} [opts.onStudentQuestionMark]
 * @param {(tStartMs: number) => void} [opts.onCueBookmark]
 * @param {() => string[]|undefined} [opts.getPollOptionLabels]
 * @param {string|null|undefined} [opts.triviaRoundId] — reset host scoreboard when round changes
 */
export function useMomentumSync({
  isHostLike,
  dispatch,
  getSerializableState,
  onStudentQuestionMark,
  onCueBookmark,
  getPollOptionLabels,
  triviaRoundId,
}) {
  const requestedRef = useRef(false);
  const hostScoresRef = useRef({});
  const pollVotesRef = useRef({});
  const sendRef = useRef(null);
  const lastTriviaRoundRef = useRef(null);

  useEffect(() => {
    if (!isHostLike || !triviaRoundId) return;
    if (triviaRoundId !== lastTriviaRoundRef.current) {
      hostScoresRef.current = {};
      lastTriviaRoundRef.current = triviaRoundId;
    }
  }, [isHostLike, triviaRoundId]);

  const handleMessage = useCallback(
    (parsed) => {
      if (!parsed.ok || !parsed.msg) return;
      const { type, data } = parsed.msg;
      const send = sendRef.current;
      if (!send) return;

      if (isHostLike) {
        if (type === ClassroomMessageType.REQUEST_FULL_STATE) {
          send(buildClassroomMessage(ClassroomMessageType.FULL_STATE, getSerializableState()));
        }
        if (type === ClassroomMessageType.ARENA_ANSWER && data) {
          const key = data.participantKey || 'Participant';
          const correct = data.choiceIndex === data.correctIndex;
          hostScoresRef.current[key] = (hostScoresRef.current[key] || 0) + (correct ? 1 : 0);
          const leaderboard = Object.entries(hostScoresRef.current)
            .map(([name, score]) => ({ name, score }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);
          dispatch({
            type: 'SCORE_SNAPSHOT',
            payload: { participantScores: { ...hostScoresRef.current }, leaderboard },
          });
          send(buildClassroomMessage(ClassroomMessageType.LEADERBOARD, { rows: leaderboard }));
        }
        if (type === ClassroomMessageType.POLL_RESPONSE && data?.pollId != null) {
          const pid = data.pollId;
          const optIdx = data.optionIndex;
          if (!pollVotesRef.current[pid]) pollVotesRef.current[pid] = {};
          pollVotesRef.current[pid][optIdx] = (pollVotesRef.current[pid][optIdx] || 0) + 1;
          const counts = { ...pollVotesRef.current[pid] };
          const options = getPollOptionLabels?.() || [];
          send(
            buildClassroomMessage(ClassroomMessageType.POLL_RESULTS, {
              pollId: pid,
              counts,
              options,
            })
          );
          dispatch({
            type: 'POLL_RESULTS_SET',
            payload: { pollId: pid, counts, options },
          });
        }
        return;
      }

      switch (type) {
        case ClassroomMessageType.FULL_STATE:
          if (data) {
            dispatch({ type: 'APPLY_FULL_STATE', payload: data });
          }
          break;
        case ClassroomMessageType.TOPIC_UPDATE:
          if (data?.entry) {
            dispatch({ type: 'TOPIC_PUSH', payload: data.entry });
          }
          break;
        case ClassroomMessageType.GLOSSARY_UPDATE:
          if (data?.terms || data?.formulas) {
            dispatch({
              type: 'GLOSSARY_MERGE',
              payload: { terms: data.terms || {}, formulas: data.formulas },
            });
          }
          break;
        case ClassroomMessageType.START_TRIVIA:
          if (data?.questions && data?.roundId) {
            dispatch({
              type: 'TRIVIA_SET',
              payload: { questions: data.questions, roundId: data.roundId },
            });
          }
          break;
        case ClassroomMessageType.LEADERBOARD:
          if (Array.isArray(data?.rows)) {
            dispatch({ type: 'LEADERBOARD_SET', payload: data.rows });
          }
          break;
        case ClassroomMessageType.POLL_START:
          if (data?.pollId && data?.question && Array.isArray(data?.options)) {
            dispatch({ type: 'POLL_SET', payload: data });
          }
          break;
        case ClassroomMessageType.POLL_RESULTS:
          if (data?.counts) {
            dispatch({ type: 'POLL_RESULTS_SET', payload: data });
          }
          break;
        case ClassroomMessageType.CUE_BOOKMARK:
          if (data?.tStartMs != null && onCueBookmark) {
            onCueBookmark(Number(data.tStartMs));
          }
          break;
        case ClassroomMessageType.STUDENT_QUESTION_MARK:
          if (onStudentQuestionMark) {
            onStudentQuestionMark(data || {});
          }
          break;
        default:
          break;
      }
    },
    [isHostLike, dispatch, getSerializableState, onCueBookmark, onStudentQuestionMark, getPollOptionLabels]
  );

  const { send } = useZoomMessaging(handleMessage);

  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  useEffect(() => {
    if (isHostLike || requestedRef.current) return;
    requestedRef.current = true;
    send(buildClassroomMessage(ClassroomMessageType.REQUEST_FULL_STATE, { ts: Date.now() }));
  }, [isHostLike, send]);

  return { send };
}
