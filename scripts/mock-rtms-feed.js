#!/usr/bin/env node
/**
 * Dev-only mock: replays a static transcript JSON through the same path as real RTMS
 * by POSTing segments to POST /api/rtms/broadcast (identical to rtms/src/index.js).
 *
 * Usage:
 *   BACKEND_URL=http://localhost:3000 MEETING_ID=your-zoom-meeting-uuid node scripts/mock-rtms-feed.js
 *
 * MEETING_ID must match a Meeting.zoom_meeting_id row (create/join a meeting in app first),
 * or use any string if you only need WebSocket clients subscribed to that id (DB save may skip).
 */

try {
  require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
} catch (_) {
  /* optional: npm i dotenv at repo root, or export BACKEND_URL / MEETING_ID in shell */
}
const fs = require('fs');
const path = require('path');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
const MEETING_ID = process.env.MEETING_ID || process.argv[2];
const FIXTURE = process.env.MOCK_TRANSCRIPT_JSON || path.join(__dirname, 'fixtures/mock-lecture-transcript.json');
const INTERVAL_MS = parseInt(process.env.MOCK_SEGMENT_INTERVAL_MS || '3000', 10);

if (!MEETING_ID) {
  console.error('Set MEETING_ID or pass uuid as first argument.');
  process.exit(1);
}

const raw = fs.readFileSync(FIXTURE, 'utf8');
const lines = JSON.parse(raw);

if (!Array.isArray(lines) || lines.length === 0) {
  console.error('Fixture must be a non-empty JSON array.');
  process.exit(1);
}

let seq = 0;
let i = 0;

async function sendLine() {
  const row = lines[i % lines.length];
  i += 1;
  seq += 1;
  const segment = {
    speakerId: 'mock-host',
    speakerLabel: row.speaker || 'Host',
    text: row.text || '',
    tStartMs: Date.now(),
    tEndMs: Date.now(),
    seqNo: seq,
  };
  try {
    const res = await fetch(`${BACKEND_URL.replace(/\/$/, '')}/api/rtms/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meetingId: MEETING_ID, segment }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`${res.status} ${t}`);
    }
    console.log(`[mock-rtms] ${seq} ${segment.text.substring(0, 60)}...`);
  } catch (e) {
    console.error('[mock-rtms] broadcast failed:', e.message);
  }
}

console.log(`Mock RTMS → ${BACKEND_URL}/api/rtms/broadcast  meetingId=${MEETING_ID}  every ${INTERVAL_MS}ms`);
sendLine();
setInterval(sendLine, INTERVAL_MS);
