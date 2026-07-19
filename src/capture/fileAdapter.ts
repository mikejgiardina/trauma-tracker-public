/**
 * File-upload fallback rung (BUILD_SPEC): <input type=file> → the same STT function
 * as the live mic. Never the demo — the rung under "live mic fails" that cannot fail
 * on stage. Since STT is server-side, this is nearly free.
 */

import type { Utterance } from '../types.ts';
import { postStt } from './adapter.ts';

export async function transcribeFile(file: File): Promise<Utterance[]> {
  return postStt(file);
}

/** the last atSec in a transcript — used to drive the replay clock for an upload. */
export function transcriptDurationSec(utterances: Utterance[]): number {
  return utterances.reduce((max, u) => Math.max(max, u.atSec), 0);
}
