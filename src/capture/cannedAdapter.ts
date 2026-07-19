/**
 * Canned replay — the zero-key fallback floor.
 *
 * Reveals the bundled SCRIPT 1 transcript + golden extraction as the replay clock
 * advances. No mic, no STT, no model call. Deterministic on every run.
 */

import type { ExtractedItem, Utterance, ValueReading } from '../types.ts';
import { cannedTranscript } from './cannedTranscript.ts';
import { cannedItems, cannedReadings } from './cannedExtraction.ts';

export interface CannedSnapshot {
  utterances: Utterance[];
  items: ExtractedItem[];
  readings: ValueReading[];
}

function tRel(sec: number): string {
  const mm = Math.floor(sec / 60);
  const ss = Math.floor(sec % 60);
  return `T+${mm}:${String(ss).padStart(2, '0')}`;
}

/** everything heard on or before `nowSec`. */
export function revealCanned(nowSec: number): CannedSnapshot {
  const utterances: Utterance[] = cannedTranscript
    .filter((l) => l.atSec <= nowSec)
    .map((l) => ({ t_rel: tRel(l.atSec), atSec: l.atSec, text: l.text }));

  const parseSec = (t: string): number => {
    const m = /T\+(\d+):(\d+)/.exec(t);
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : 0;
  };

  const items = cannedItems.filter((i) => parseSec(i.t_rel) <= nowSec);
  const readings = cannedReadings.filter((r) => r.heardAtSec <= nowSec);
  return { utterances, items, readings };
}
