/**
 * Deterministic trauma scores (buildable task #3).
 *
 * Pure functions — no LLM, no state. The physiology lane only feeds inputs; the score
 * IS a pure function of them. Formulas + coding tables from src/data/trauma_scores.json.
 *
 * Table-tested (tools/test_scores.ts) against the four known values from
 * fixtures/expected_extraction.json:
 *   shockIndex(128, 88) = 1.45   shockIndex(132, 84) = 1.57
 *   rts(13, 88, 24)     = 7.11   rts(9, 84, 24)      = 6.17
 *
 * MGAP / GAP are intentionally compute:null pending clinician-verified coding
 * (don't ship a wrong formula).
 */

import type { ScoreSnapshot, ValuesState } from '../types.ts';

const round2 = (x: number): number => Math.round(x * 100) / 100;

/** GCS total from the three components (each already coded to its scale). */
export function gcsFromComponents(eye: number, verbal: number, motor: number): number {
  return eye + verbal + motor;
}

/** Shock Index = HR / SBP. Elevated > 0.9 (occult shock); critical >= 1.0. */
export function shockIndex(hr: number, sbp: number): number {
  if (!sbp) return NaN;
  return round2(hr / sbp);
}

/* RTS coding tables — src/data/trauma_scores.json → scores.RTS.coding */

/** GCS component coding: 13-15→4, 9-12→3, 6-8→2, 4-5→1, 3→0. */
export function gcsCoding(gcs: number): number {
  if (gcs >= 13) return 4;
  if (gcs >= 9) return 3;
  if (gcs >= 6) return 2;
  if (gcs >= 4) return 1;
  return 0;
}

/** SBP component coding: >89→4, 76-89→3, 50-75→2, 1-49→1, 0→0. */
export function sbpCoding(sbp: number): number {
  if (sbp > 89) return 4;
  if (sbp >= 76) return 3;
  if (sbp >= 50) return 2;
  if (sbp >= 1) return 1;
  return 0;
}

/** RR component coding: 10-29→4, >29→3, 6-9→2, 1-5→1, 0→0. */
export function rrCoding(rr: number): number {
  if (rr >= 10 && rr <= 29) return 4;
  if (rr > 29) return 3;
  if (rr >= 6) return 2;
  if (rr >= 1) return 1;
  return 0;
}

/** Revised Trauma Score = 0.9368*GCS_c + 0.7326*SBP_c + 0.2908*RR_c. Lower = worse. */
export function rts(gcs: number, sbp: number, rr: number): number {
  const v = 0.9368 * gcsCoding(gcs) + 0.7326 * sbpCoding(sbp) + 0.2908 * rrCoding(rr);
  return round2(v);
}

/** Compute the live score snapshot from the current value stream. */
export function computeScores(values: ValuesState): ScoreSnapshot {
  const { GCS, SBP, HR, RR } = values;
  return {
    GCS: GCS,
    shockIndex: HR != null && SBP != null ? shockIndex(HR, SBP) : null,
    RTS: GCS != null && SBP != null && RR != null ? rts(GCS, SBP, RR) : null,
    MGAP: null, // pending clinician-verified coding
    GAP: null, // pending clinician-verified coding
  };
}
