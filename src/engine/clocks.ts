/**
 * Clocks + staleness.
 *
 * INVARIANT (BUILD_SPEC / OBLIGATIONS_MODEL): clocks only mutate material(). They
 * never fire a prompt and never schedule anything. Everything here is a pure
 * function of the corpus + value stream + the current `now`.
 */

import type { ValuesState } from '../types.ts';
import type { Corpus } from './matcher.ts';
import { firstMatch } from './matcher.ts';

const STALE_S = 90;

/** first spoken time of any of `phrases` (guard-free), or null. */
function firstAtSec(corpus: Corpus, phrases: string[]): number | null {
  const hit = firstMatch(corpus, phrases);
  return hit ? hit.atSec : null;
}

export interface ClockState {
  /** critical-care minutes accrued so far (wall clock from CC start to now/disposition). */
  criticalCareAccruedMin: number;
  criticalCareStartedAtSec: number | null;
  /** true when the last HR *and* BP are older than the staleness window. */
  vitalsStale: boolean;
  lastVitalAtSec: number | null;
  /** seconds since trauma activation, or null if not yet activated. */
  sinceActivationSec: number | null;
  activationAtSec: number | null;
  dispositionAtSec: number | null;
}

const CC_START = ['critical care time', 'starting critical care'];
const CC_STOP = ['disposition', 'patient departing', 'departing for the or', 'leaving for the or'];
const ACTIVATION = ['trauma activation', 'trauma team activation', 'level one', 'level 1 activation'];

export function computeClocks(corpus: Corpus, values: ValuesState, nowSec: number): ClockState {
  const activationAtSec = firstAtSec(corpus, ACTIVATION);
  const dispositionAtSec = firstAtSec(corpus, CC_STOP);
  const ccStart = firstAtSec(corpus, CC_START);

  // wall-clock accrual; ACEP pauses (separately-reportable procedures) would only
  // *reduce* this further — it is already well under 30 min in the ~3:45 case, so the
  // 99291 gate outcome (decline) is unchanged either way.
  let criticalCareAccruedMin = 0;
  if (ccStart != null) {
    const end = dispositionAtSec != null ? Math.min(nowSec, Math.max(ccStart, dispositionAtSec)) : nowSec;
    criticalCareAccruedMin = Math.max(0, (end - ccStart) / 60);
  }

  const hr = values.latest['HR']?.heardAtSec;
  const bp = values.latest['BP']?.heardAtSec;
  const lastVitalAtSec =
    hr != null && bp != null ? Math.max(hr, bp) : (hr ?? bp ?? null);
  // stale only once resuscitation has some vitals to go stale; before any vital, not "stale".
  const vitalsStale = lastVitalAtSec != null && nowSec - lastVitalAtSec > STALE_S;

  return {
    criticalCareAccruedMin,
    criticalCareStartedAtSec: ccStart,
    vitalsStale,
    lastVitalAtSec,
    sinceActivationSec: activationAtSec != null ? nowSec - activationAtSec : null,
    activationAtSec,
    dispositionAtSec,
  };
}

/** deadline reached: `deadlineMin` past `startAtSec` (used for the EFAST 10-min watch). */
export function deadlineElapsed(startAtSec: number | null, deadlineMin: number, nowSec: number): boolean {
  return startAtSec != null && nowSec - startAtSec >= deadlineMin * 60;
}
