/**
 * Host ↔ participant messages via Zoom Apps SDK postMessage / onMessage.
 * Keep payloads JSON-serializable; version field allows future evolution.
 */

export const CLASSROOM_MSG_VERSION = 1;

export const ClassroomMessageType = {
  REQUEST_FULL_STATE: 'REQUEST_FULL_STATE',
  FULL_STATE: 'FULL_STATE',
  TOPIC_UPDATE: 'TOPIC_UPDATE',
  GLOSSARY_UPDATE: 'GLOSSARY_UPDATE',
  START_TRIVIA: 'START_TRIVIA',
  ARENA_ANSWER: 'ARENA_ANSWER',
  LEADERBOARD: 'LEADERBOARD',
  POLL_START: 'POLL_START',
  POLL_RESPONSE: 'POLL_RESPONSE',
  POLL_RESULTS: 'POLL_RESULTS',
  /** Host broadcasts so each student POSTs auto_cue bookmark */
  CUE_BOOKMARK: 'CUE_BOOKMARK',
  /** Timeline annotation when spotlight API unavailable */
  STUDENT_QUESTION_MARK: 'STUDENT_QUESTION_MARK',
};

/**
 * @param {string} type
 * @param {object} [data]
 * @returns {{ v: number, type: string, data?: object, ts: number }}
 */
export function buildClassroomMessage(type, data = undefined) {
  const payload = { v: CLASSROOM_MSG_VERSION, type, ts: Date.now() };
  if (data !== undefined) payload.data = data;
  return payload;
}

/**
 * @param {unknown} raw
 * @returns {{ ok: boolean, msg?: object, error?: string }}
 */
export function parseClassroomMessage(raw) {
  if (raw == null) return { ok: false, error: 'empty' };
  let obj = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return { ok: false, error: 'invalid json' };
    }
  }
  if (typeof obj !== 'object') {
    return { ok: false, error: 'not an object' };
  }
  if (!obj.type && obj.payload && typeof obj.payload === 'object' && obj.payload.type) {
    return { ok: true, msg: obj.payload };
  }
  if (!obj.type) {
    return { ok: false, error: 'missing type' };
  }
  return { ok: true, msg: obj };
}
