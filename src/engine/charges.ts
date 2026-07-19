/**
 * Charges + activation-fee determination, derived from the obligations ledger.
 *
 * Each charge-kind obligation is a billable line; its STATE selects the disposition
 * (billed / held / unresolved / declined). CPT comes from the obligation's code_map
 * (site/axis-derived) — NOT from charges.json's static cpt, which carries the three
 * known-wrong codes (SPLINT 29105, WOUND-CX 12052, and the G0390/99291 OCE edit).
 */

import type {
  ActivationDetermination,
  ChargeRuntime,
  ChargeStatus,
  EngineConfig,
  ObligationRuntime,
  WalkerResult,
} from '../types.ts';
import { getCharge, getObligation } from './loader.ts';

const G0390_CITATION = 'CMS MLN MM5438 — OCE edit: G0390 requires CPT 99291 (≥30 min critical care) on the same DOS.';

function gapTextFor(id: string, fallback?: string): string | undefined {
  const def = getObligation(id) as ({ _gap_text?: string; terminal?: { gap_text?: string } }) | undefined;
  return def?._gap_text ?? def?.terminal?.gap_text ?? fallback;
}

function statusFromState(rt: ObligationRuntime): ChargeStatus {
  switch (rt.state) {
    case 'satisfied': return 'billed';
    case 'unresolved': return 'unresolved';
    case 'missing':
    case 'ambiguous': return 'held';
    case 'not_applicable': return 'not_applicable';
    default: return 'dormant';
  }
}

export function computeCharges(
  runtimes: ObligationRuntime[],
  config: EngineConfig,
): { charges: ChargeRuntime[]; estimatedTotal: number } {
  const charges: ChargeRuntime[] = [];

  for (const rt of runtimes) {
    if (rt.subject.kind !== 'charge') continue;
    if (rt.state === 'dormant') continue;

    const code = rt.subject.ref ?? rt.id;
    const base = code ? getCharge(code) : undefined;
    const isG0390 = rt.subject.hcpcs === 'G0390';

    let status = statusFromState(rt);
    let reason: string | undefined;
    let citation: string | undefined;
    let price = rt.dollarImpact ?? base?.price ?? 0;
    let cpt = rt.cptSelected ?? (rt.subject.hcpcs ?? null);

    if (isG0390 && rt.state !== 'satisfied') {
      // the headline finding: activation reports rev 0681, but the G0390 HCPCS is declined.
      status = config.g0390Mode === 'decline_with_citation' ? 'declined' : 'unresolved';
      reason = gapTextFor(rt.id, 'G0390 not billed — requires ≥30 min critical care (CPT 99291).');
      citation = G0390_CITATION;
      price = 0;
      cpt = 'G0390';
    } else if (status === 'unresolved') {
      reason = gapTextFor(rt.id);
    }

    charges.push({
      code: isG0390 ? 'TRM-ACT-G0390' : code,
      name: isG0390 ? 'Trauma activation, critical-care-associated (G0390)' : (base?.name ?? rt.label),
      cpt,
      price,
      status,
      obligationId: rt.id,
      reason,
      citation,
    });
  }

  const estimatedTotal = charges
    .filter((c) => c.status === 'billed')
    .reduce((sum, c) => sum + c.price, 0);

  return { charges, estimatedTotal };
}

export function computeActivation(
  runtimes: ObligationRuntime[],
  walker: WalkerResult,
  config: EngineConfig,
): ActivationDetermination {
  const act = runtimes.find((r) => r.id === 'OBL-TRM-ACT-068X');
  const atom = (id: string) => act?.atoms.find((a) => a.id === id)?.satisfied ?? false;

  const activationDocumented = atom('documented');
  const teamResponded = atom('team_responded');
  const prehospitalNotification = atom('prehospital_notification');
  const qualifies = walker.anyCriterionSatisfied && activationDocumented;

  const openConditions: string[] = [];
  if (!walker.anyCriterionSatisfied) openConditions.push('No activation criterion satisfied');
  if (!activationDocumented) openConditions.push('Activation not documented');
  if (!teamResponded) openConditions.push('Team response not captured');
  if (!prehospitalNotification) openConditions.push('Prehospital notification / inter-hospital transfer not captured');

  const g0390 = runtimes.find((r) => r.subject.hcpcs === 'G0390');
  const g0390Billed = g0390?.state === 'satisfied';
  const feeDisposition = g0390Billed
    ? 'Rev 0681 reports; G0390 billed (critical care ≥30 min documented).'
    : config.g0390Mode === 'decline_with_citation'
      ? 'Rev 0681 reports; G0390 not billed — critical care < 30 min (CPT 99291 not met). ' + G0390_CITATION
      : 'Activation shown as one unattributed determination pending critical-care reconciliation.';

  return {
    qualifies,
    criteriaMet: walker.criteriaMet.map((c) => ({ category: c.category, criterion: c.criterion, evidence: c.evidence })),
    activationDocumented,
    teamResponded,
    prehospitalNotification,
    openConditions,
    feeDisposition,
  };
}
