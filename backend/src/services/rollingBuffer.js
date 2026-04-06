/**
 * In-memory rolling transcript context per live meeting (Zoom meeting UUID).
 * Used for professor-mode AI (topic detection, cues) without sending the full hour to the LLM.
 */

const MAX_WORDS = parseInt(process.env.ROLLING_BUFFER_MAX_WORDS || '300', 10);

/** @type {Map<string, { words: string[] }>} */
const buffers = new Map();

function appendFromSegment(meetingId, text) {
  if (!meetingId || !text || typeof text !== 'string') return;
  const t = text.trim();
  if (!t) return;

  let entry = buffers.get(meetingId);
  if (!entry) {
    entry = { words: [] };
    buffers.set(meetingId, entry);
  }

  const newWords = t.split(/\s+/).filter(Boolean);
  entry.words.push(...newWords);
  while (entry.words.length > MAX_WORDS) {
    entry.words.shift();
  }
}

function getText(meetingId) {
  const entry = buffers.get(meetingId);
  if (!entry || entry.words.length === 0) return '';
  return entry.words.join(' ');
}

function clear(meetingId) {
  buffers.delete(meetingId);
}

function getStats() {
  return {
    meetingCount: buffers.size,
    maxWords: MAX_WORDS,
    keys: Array.from(buffers.keys()),
  };
}

module.exports = {
  appendFromSegment,
  getText,
  clear,
  getStats,
  MAX_WORDS,
};
