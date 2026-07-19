/**
 * Accreditation / quality-measure compliance.
 *
 * Most measures are satisfied via an obligation's `satisfies_measure` link; the
 * response-time measures (trauma surgeon at bedside) are timed off the corpus.
 * Only case-relevant measures are surfaced — the STEMI/sepsis/stroke rows stay
 * not_applicable for a trauma case.
 */

import type { MeasureResult, ObligationRuntime } from '../types.ts';
import type { Corpus } from './matcher.ts';
import type { ClockState } from './clocks.ts';
import { firstMatch } from './matcher.ts';
import { getMeasure, obligations } from './loader.ts';

const BEDSIDE = ['surgeon at bedside', 'surgery team is at bedside', 'surgery at bedside', 'at bedside', 'team is at bedside'];

/** obligation -> measure links declared in obligations.json (satisfies_measure). */
function measureSatisfiedBy(measureId: string, runtimes: ObligationRuntime[]): boolean {
  const linked = obligations.filter(
    (o) => (o as { satisfies_measure?: string }).satisfies_measure === measureId,
  );
  return linked.some((o) => runtimes.find((r) => r.id === o.id)?.state === 'satisfied');
}

export function computeMeasures(
  runtimes: ObligationRuntime[],
  corpus: Corpus,
  clocks: ClockState,
  anyCriterion: boolean,
): MeasureResult[] {
  if (clocks.activationAtSec == null) return []; // no trauma activation yet

  const out: MeasureResult[] = [];
  const activation = clocks.activationAtSec;

  // 1. airway secured + confirmed
  const airway = getMeasure('AIRWAY_SECURED_CONFIRMED');
  if (airway) {
    out.push({
      id: airway.id,
      name: airway.name,
      status: measureSatisfiedBy('AIRWAY_SECURED_CONFIRMED', runtimes) ? 'met' : 'open',
    });
  }

  // 2. trauma surgeon at bedside (response-time)
  const surgeon = getMeasure('TRAUMA_SURGEON_BEDSIDE');
  if (surgeon) {
    const hit = firstMatch(corpus, BEDSIDE);
    const elapsedMin = hit ? (hit.atSec - activation) / 60 : undefined;
    const target = surgeon.target_min ?? 15;
    const status: MeasureResult['status'] = hit
      ? (elapsedMin! <= target ? 'met' : 'missed')
      : 'open';
    out.push({
      id: surgeon.id,
      name: surgeon.name,
      status,
      targetMin: target,
      elapsedMin: elapsedMin != null ? Math.round(elapsedMin * 100) / 100 : undefined,
      detail: hit ? `at bedside ${elapsedMin!.toFixed(1)} min after activation (target ${target})` : undefined,
    });
  }

  // 3. EFAST during primary survey
  const efast = getMeasure('EFAST_PRIMARY_SURVEY');
  if (efast) {
    out.push({
      id: efast.id,
      name: efast.name,
      status: measureSatisfiedBy('EFAST_PRIMARY_SURVEY', runtimes) ? 'met' : 'open',
      targetMin: efast.target_min,
    });
  }

  // 4. critical care time (billable-time gate)
  const cc = getMeasure('CRITICAL_CARE_TIME');
  if (cc && clocks.criticalCareStartedAtSec != null) {
    const min = clocks.criticalCareAccruedMin;
    out.push({
      id: cc.id,
      name: cc.name,
      status: min >= (cc.min_qualifying_min as number ?? 30) ? 'met' : 'open',
      targetMin: cc.min_qualifying_min as number ?? 30,
      elapsedMin: Math.round(min * 100) / 100,
      detail: `${min.toFixed(1)} min accrued in-bay (target ${cc.min_qualifying_min ?? 30})`,
    });
  }

  // 5. activation criteria (qualification ruleset)
  const crit = getMeasure('TRAUMA_ACTIVATION_CRITERIA');
  if (crit) {
    out.push({
      id: crit.id,
      name: crit.name,
      status: anyCriterion ? 'met' : 'open',
    });
  }

  return out;
}
