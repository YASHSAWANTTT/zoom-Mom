import { useReducer, useCallback } from 'react';

export const initialMomentumState = {
  topicHistory: [],
  glossary: {},
  formulas: [],
  trivia: null,
  poll: null,
  pollResults: null,
  leaderboard: [],
  participantScores: {},
  triviaRoundId: null,
};

function momentumReducer(state, action) {
  switch (action.type) {
    case 'RESET':
      return { ...initialMomentumState };
    case 'APPLY_FULL_STATE':
      return {
        ...state,
        topicHistory: action.payload.topicHistory ?? state.topicHistory,
        glossary: action.payload.glossary ?? state.glossary,
        formulas: action.payload.formulas ?? state.formulas,
        trivia: action.payload.trivia ?? state.trivia,
        triviaRoundId: action.payload.triviaRoundId ?? state.triviaRoundId,
        poll: action.payload.poll ?? state.poll,
        pollResults: action.payload.pollResults ?? state.pollResults,
        leaderboard: action.payload.leaderboard ?? state.leaderboard,
        participantScores: action.payload.participantScores ?? state.participantScores,
      };
    case 'TOPIC_PUSH': {
      const entry = action.payload;
      const next = [...state.topicHistory, entry].filter(Boolean).slice(-25);
      return { ...state, topicHistory: next };
    }
    case 'GLOSSARY_MERGE':
      return {
        ...state,
        glossary: { ...state.glossary, ...(action.payload.terms || {}) },
        formulas: action.payload.formulas
          ? [...(state.formulas || []), ...action.payload.formulas].slice(-30)
          : state.formulas,
      };
    case 'TRIVIA_SET':
      return {
        ...state,
        trivia: action.payload.questions,
        triviaRoundId: action.payload.roundId,
        participantScores: {},
        leaderboard: [],
      };
    case 'SCORE_ADD': {
      const { key, delta } = action.payload;
      const next = { ...state.participantScores, [key]: (state.participantScores[key] || 0) + delta };
      const leaderboard = Object.entries(next)
        .map(([name, score]) => ({ name, score }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
      return { ...state, participantScores: next, leaderboard };
    }
    case 'SCORE_SNAPSHOT':
      return {
        ...state,
        participantScores: action.payload.participantScores,
        leaderboard: action.payload.leaderboard,
      };
    case 'POLL_SET':
      return { ...state, poll: action.payload, pollResults: null };
    case 'POLL_RESULTS_SET':
      return {
        ...state,
        pollResults: {
          ...action.payload,
          options: action.payload.options || state.poll?.options,
        },
        poll: null,
      };
    case 'LEADERBOARD_SET':
      return { ...state, leaderboard: action.payload };
    default:
      return state;
  }
}

export function useMomentumHostState() {
  const [state, dispatch] = useReducer(momentumReducer, initialMomentumState);

  const getSerializableState = useCallback(() => ({
    topicHistory: state.topicHistory,
    glossary: state.glossary,
    formulas: state.formulas,
    trivia: state.trivia,
    triviaRoundId: state.triviaRoundId,
    poll: state.poll,
    pollResults: state.pollResults,
    leaderboard: state.leaderboard,
    participantScores: state.participantScores,
  }), [state]);

  return { state, dispatch, getSerializableState };
}
