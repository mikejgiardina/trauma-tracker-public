/**
 * The deterministic recompute. recompute(input, config) -> EngineState.
 *
 * Pure and synchronous: called on every transcript delta AND every clock tick. A
 * prompt is a pure render of this state; nothing here schedules anything. Cross-
 * obligation references (G0390->99291, PHYS_AIRWAY->ETI, 068X->lattice) are settled
 * by iterating walker+ledger to a fixpoint before the renderer is consulted.
 */

import type {
  ActivePrompt,
  EngineConfig,
  EngineState,
  Gap,
  ObligationRuntime,
  ObligationState,
  ScoreTimelinePoint,
  Utterance,
  ValueReading,
  WalkerResult,
} from '../types.ts';
import { buildCorpus } from './matcher.ts';
import { buildValues } from './values.ts';
import { computeScores } from './scores.ts';
import { computeClocks } from './clocks.ts';
import { walk, type WalkerCtx } from './walker.ts';
import { evalLedger, type LedgerCtx } from './ledger.ts';
import { evalPredicate } from './predicates.ts';
import { computeActivation, computeCharges } from './charges.ts';
import { computeMeasures } from './measures.ts';
import { lattice, obligations, getObligation } from './loader.ts';

export interface EngineInput {
  utterances: Utterance[];
  readings: ValueReading[];
  nowSec: number;
  /** obligation ids the human dismissed/deferred at the prompt surface. */
  dismissed?: string[];
}

export const defaultConfig: EngineConfig = {
  settleMs: 3000,
  cooldownS: 45,
  maxPrompts: 1,
  facilityTraumaDesignation: 'ACS_verified',
  g0390Mode: 'decline_with_citation',
  dispositionSec: Infinity,
};

/** score snapshots at each point a score input changed, up to now. */
function buildScoreTimeline(readings: ValueReading[], corpus: ReturnType<typeof buildCorpus>, nowSec: number): ScoreTimelinePoint[] {
  const relevant = new Set(['HR', 'BP', 'GCS', 'RR']);
  const times = [...new Set(readings.filter((r) => relevant.has(r.name) && r.heardAtSec <= nowSec).map((r) => r.heardAtSec))].sort((a, b) => a - b);
  const points: ScoreTimelinePoint[] = [];
  let prevKey = '';
  for (const t of times) {
    const v = buildValues(readings, corpus, t);
    const s = computeScores(v);
    const key = `${s.GCS}|${s.shockIndex}|${s.RTS}`;
    if (key === prevKey) continue;
    prevKey = key;
    const mm = Math.floor(t / 60);
    const ss = t % 60;
    points.push({ ...s, t_rel: `T+${mm}:${String(ss).padStart(2, '0')}`, atSec: t });
  }
  return points;
}

function rankPrompt(a: ActivePrompt & { weight: number }, b: ActivePrompt & { weight: number }): number {
  return b.weight - a.weight;
}

export function recompute(input: EngineInput, config: EngineConfig = defaultConfig): EngineState {
  const { utterances, readings, nowSec } = input;
  const dismissed = new Set(input.dismissed ?? []);

  const corpus = buildCorpus(utterances, nowSec);
  const values = buildValues(readings, corpus, nowSec);
  const scores = computeScores(values);
  const scoreTimeline = buildScoreTimeline(readings, corpus, nowSec);
  const clocks = computeClocks(corpus, values, nowSec);

  const pastDisposition =
    (clocks.dispositionAtSec != null && nowSec >= clocks.dispositionAtSec) ||
    nowSec >= config.dispositionSec;
  const resuscitationActive = clocks.activationAtSec != null && !pastDisposition;

  // ── fixpoint: walker (needs obligation states) <-> ledger (needs lattice result) ──
  let obligationStates: Record<string, ObligationState> = {};
  let walker: WalkerResult = { criteriaMet: [], anyCriterionSatisfied: false, prompt: null, enteredFamilies: [] };
  let runtimes: ObligationRuntime[] = [];

  for (let pass = 0; pass < 5; pass++) {
    const walkerCtx: WalkerCtx = {
      corpus,
      values,
      nowSec,
      settleMs: config.settleMs,
      dismissed,
      evalPredicate: (pred) =>
        evalPredicate(pred, {
          values, nowSec, resuscitationActive, obligationStates,
          criticalCareAccruedMin: clocks.criticalCareAccruedMin,
          latticeAnyCriterion: walker.anyCriterionSatisfied,
        }),
    };
    walker = walk(lattice, walkerCtx);

    const ledgerCtx: LedgerCtx = {
      corpus, values, clocks, nowSec, resuscitationActive,
      latticeAnyCriterion: walker.anyCriterionSatisfied,
      obligationStates, dismissed, settleMs: config.settleMs,
    };
    runtimes = evalLedger(obligations, ledgerCtx);

    const next: Record<string, ObligationState> = {};
    for (const r of runtimes) next[r.id] = r.state;
    const stable = obligations.every((o) => next[o.id] === obligationStates[o.id]);
    obligationStates = next;
    if (stable && pass > 0) break;
  }

  // ── disposition sweep: open + material obligations take their terminal.if_open ──
  if (pastDisposition) {
    for (const r of runtimes) {
      if (r.state === 'missing' || r.state === 'ambiguous') {
        r.state = (r.terminal?.if_open as ObligationState) ?? 'unresolved';
        r.render = false;
        r.promptText = undefined;
      }
    }
  }

  const { charges, estimatedTotal } = computeCharges(runtimes, config);
  const activation = computeActivation(runtimes, walker, config);
  const measures = computeMeasures(runtimes, corpus, clocks, walker.anyCriterionSatisfied);

  // ── page-2 gaps: unresolved obligations ──
  const gaps: Gap[] = runtimes
    .filter((r) => r.state === 'unresolved')
    .map((r) => {
      const def = getObligation(r.id) as ({ _gap_text?: string } | undefined);
      return {
        obligationId: r.id,
        label: r.label,
        text: def?._gap_text ?? r.terminal?.gap_text ?? `${r.label}: open at disposition.`,
        dollarImpact: r.dollarImpact,
      };
    });

  // ── the single prompt surface: ledger renders ∪ the lattice prompt, ranked ──
  const cands: (ActivePrompt & { weight: number })[] = [];
  for (const r of runtimes) {
    if (r.render && r.promptText) {
      const qual = r.materialArms.includes('qualification');
      cands.push({
        source: 'ledger', obligationId: r.id, text: r.promptText,
        subline: r.subject.kind === 'charge' ? `$${(r.dollarImpact ?? 0).toFixed(0)} at stake` : undefined,
        weight: (qual ? 100 : 50) + (r.dollarImpact ?? 0) / 100,
      });
    }
  }
  if (walker.prompt) {
    cands.push({
      source: 'lattice', nodeId: walker.prompt.nodeId, text: walker.prompt.text,
      subline: walker.prompt.subline, weight: 60 + walker.prompt.infoGain,
    });
  }
  cands.sort(rankPrompt);
  const activePrompt: ActivePrompt | null = cands[0]
    ? { source: cands[0].source, obligationId: cands[0].obligationId, nodeId: cands[0].nodeId, text: cands[0].text, subline: cands[0].subline }
    : null;

  return {
    nowSec,
    values,
    scores,
    scoreTimeline,
    obligations: runtimes,
    activePrompt,
    charges,
    estimatedTotal,
    activation,
    measures,
    gaps,
    resuscitationActive,
  };
}

/* re-export the substrate so callers import one module */
export * from './loader.ts';
export { buildCorpus } from './matcher.ts';
export { computeScores } from './scores.ts';
