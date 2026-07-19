/**
 * Safe predicate evaluator.
 *
 * The reference JSON carries predicate STRINGS ("values.SBP < 90"). We never eval() them.
 * This maps the finite, known set of predicate shapes to computed booleans, returning
 * 'unknown' for the NEEDS-CODER / NEEDS-CLINICIAN atoms that are not signed off.
 *
 * Callers decide what 'unknown' means in their context:
 *  - obligation requires → treat unknown as non-gating (satisfied-but-flagged)
 *  - lattice qualifying   → treat unknown as NOT met (never fabricate a criterion)
 */

import type { ObligationState, ValuesState } from '../types.ts';
import { gcsMaxDrop } from './values.ts';

export type PredResult = boolean | 'unknown';

export interface EvalContext {
  values: ValuesState;
  nowSec: number;
  resuscitationActive: boolean;
  obligationStates: Record<string, ObligationState>;
  criticalCareAccruedMin: number;
  latticeAnyCriterion: boolean;
}

// null reading = not yet stale (don't fire a freshness prompt before the first vitals land).
const freshWithin = (heardAtSec: number | undefined, nowSec: number, sec: number): boolean =>
  heardAtSec == null ? true : nowSec - heardAtSec < sec;

export function evalPredicate(predRaw: string, ctx: EvalContext): PredResult {
  const pred = predRaw.trim();
  const v = ctx.values;

  if (pred.includes('NEEDS-CODER') || pred.includes('NEEDS-CLINICIAN')) return 'unknown';

  if (pred.includes('any_criterion_satisfied')) return ctx.latticeAnyCriterion;

  // obligations['ID'].state === 'satisfied'
  const om = /obligations\['([^']+)'\]\.state\s*===\s*'satisfied'/.exec(pred);
  if (om) return ctx.obligationStates[om[1]] === 'satisfied';

  if (pred.includes('clocks.critical_care.accrued_min')) {
    const m = />=\s*(\d+)/.exec(pred);
    return ctx.criticalCareAccruedMin >= (m ? parseInt(m[1], 10) : 30);
  }

  if (pred === 'resuscitation_active === true') return ctx.resuscitationActive;

  if (pred.includes('values.iv_sites')) return v.iv_sites != null && v.iv_sites >= 2;
  if (pred.includes('values.iv_gauge')) return v.iv_gauge != null && v.iv_gauge <= 16;
  if (pred.includes('values.prbc_units')) return v.prbc_units != null;
  if (pred.includes('values.splint_site')) return v.splint_site != null;
  if (pred.includes('values.laceration_cm')) return v.laceration_cm != null;

  if (pred.includes('values.SBP')) return v.SBP != null && v.SBP < 90;
  if (pred.includes('values.RR')) return v.RR != null && (v.RR < 10 || v.RR > 29);
  if (pred.includes('values.GCS')) {
    if (v.GCS == null) return false;
    return v.GCS < 9 || gcsMaxDrop(v) >= 4;
  }

  if (pred.includes('values.Age')) return v.Age != null;
  if (pred.includes('values.Sex')) return v.Sex != null;
  if (pred.includes('values.Weight')) return v.Weight != null;

  // vitals freshness: "now - values.HR.heard_at < 90s"
  if (pred.includes('values.HR.heard_at')) return freshWithin(v.latest['HR']?.heardAtSec, ctx.nowSec, 90);
  if (pred.includes('values.BP.heard_at')) return freshWithin(v.latest['BP']?.heardAtSec, ctx.nowSec, 90);

  return 'unknown';
}
