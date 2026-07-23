// src/capture/transcriptAdapter.ts
// Transcript injection — the "audio -> transcript" upstream path. A dialogue that was
// transcribed somewhere else is parsed into timed Utterances and fed straight into the
// production extractor, SKIPPING audio + STT (and their calls). Lets you author a case as
// text and run it through the real product exactly as if it had been heard live.
//
// Accepted line shapes (one utterance per line; blank lines and un-timestamped lines
// like scene headers are ignored):
//   T+1:35 Trauma Lead: He's dropping his GCS, we're intubating.
//   [T+1:35] intubating now
//   1:35 Recorder: ...
//   01:02:15 ...            (H:MM:SS)
// A leading "Speaker:" label is stripped — we catalogue WHAT was said, not who.

import type { Utterance } from '../types.ts';

function tRel(atSec: number): string {
  const s = Math.max(0, Math.round(atSec));
  return `T+${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

export function parseTranscript(text: string): Utterance[] {
  const out: Utterance[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^\[?\s*(?:T\+)?(\d{1,2}):(\d{2})(?::(\d{2}))?\s*\]?\s*(.*)$/.exec(line);
    if (!m) continue; // no leading timestamp -> not an utterance (header/comment)
    const hasHours = m[3] != null;
    const atSec = hasHours
      ? parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10)
      : parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    // strip an optional "Speaker:" prefix (short leading token followed by a colon)
    const body = m[4].trim().replace(/^[A-Za-z][A-Za-z0-9 .'/-]{0,28}:\s*/, '').trim();
    if (!body) continue;
    out.push({ t_rel: tRel(atSec), atSec, text: body });
  }
  return out.sort((a, b) => a.atSec - b.atSec);
}
