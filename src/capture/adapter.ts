/**
 * Capture contracts shared by the canned / mic / file paths.
 *
 * STT is server-side behind a swappable adapter (ADR-0013): the browser POSTs audio
 * to /.netlify/functions/stt and never holds a vendor key. The function normalizes
 * every vendor to one shape: { utterances: [{ atSec, text }] }.
 */

import type { Utterance } from '../types.ts';

export type CaptureMode = 'canned' | 'live' | 'file';

export interface SttResult {
  utterances: { atSec: number; text: string }[];
}

export const STT_ENDPOINT = '/.netlify/functions/stt';

/** map the normalized STT shape onto the engine's Utterance contract. */
export function toUtterances(res: SttResult): Utterance[] {
  return res.utterances
    .filter((u) => u.text && u.text.trim())
    .map((u) => {
      const mm = Math.floor(u.atSec / 60);
      const ss = Math.floor(u.atSec % 60);
      return { t_rel: `T+${mm}:${String(ss).padStart(2, '0')}`, atSec: u.atSec, text: u.text.trim() };
    });
}

/** POST an audio blob/file to the STT function; returns normalized utterances. */
export async function postStt(audio: Blob): Promise<Utterance[]> {
  const res = await fetch(STT_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': audio.type || 'application/octet-stream' },
    body: audio,
  });
  if (!res.ok) throw new Error(`STT ${res.status}: ${await res.text().catch(() => '')}`);
  const json = (await res.json()) as SttResult;
  return toUtterances(json);
}
