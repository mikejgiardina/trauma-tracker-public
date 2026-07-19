/**
 * The activation-criteria lattice walker (activation_lattice.json → walker.steps).
 *
 * enter → prune (resolved · excluded · blocked/locked · immaterial) → rank by
 * info_gain → render exactly ONE. The tap-tap-tap cascade is emergent: this runs
 * fresh on every recompute, so a prompt retracts itself the instant the room answers.
 *
 * A prompt is a pure render of state, never an event (hard_invariant).
 */

import type {
  ActivationLattice,
  LatticeFamily,
  LatticeModifier,
  LatticeNode,
  ValuesState,
  WalkerResult,
} from '../types.ts';
import type { Corpus } from './matcher.ts';
import type { PredResult } from './predicates.ts';
import { anyPresent, contains, firstMatch } from './matcher.ts';

export interface WalkerCtx {
  corpus: Corpus;
  values: ValuesState;
  nowSec: number;
  settleMs: number;
  /** node ids the human dismissed/deferred at the prompt surface (symmetric with the ledger). */
  dismissed?: Set<string>;
  /** evaluate a shape=predicate node (PHYS_* criteria) against the value stream. */
  evalPredicate: (pred: string) => PredResult;
}

// structural extension so evalNode can reach sibling families for delegation.
type CtxWithLattice = WalkerCtx & { _lattice: ActivationLattice };

type NodeStatus = 'met' | 'not_met' | 'ambiguous' | 'dormant';

/** a lexicon hit that is not scoped-out by an enter_guard negation. */
function enteredUnnegated(corpus: Corpus, phrases: string[]): boolean {
  // enter_guard.not_preceded_by_negation: the phrase must appear NOT negated.
  return firstMatch(corpus, phrases, { not_negated: true }) !== null;
}

function familyEntered(corpus: Corpus, fam: LatticeFamily): boolean {
  if (fam.enter_when.always) return true;
  const phrases = fam.enter_when.any_of ?? [];
  if (fam.enter_guard?.not_preceded_by_negation) return enteredUnnegated(corpus, phrases);
  return anyPresent(corpus, phrases);
}

function earliestPhraseSec(corpus: Corpus, phrases: string[]): number | null {
  const hit = firstMatch(corpus, phrases);
  return hit ? hit.atSec : null;
}

/** distance in feet spoken anywhere in the corpus ("twenty feet", "20 ft"), or null. */
function parseDistanceFt(corpus: Corpus): { ft: number; raw: string } | null {
  const words: Record<string, number> = {
    ten: 10, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  };
  for (const l of corpus.lines) {
    const num = /(\d+)\s*(?:ft|feet|foot)\b/.exec(l.norm);
    if (num) return { ft: parseInt(num[1], 10), raw: `${num[1]} feet` };
    for (const [w, v] of Object.entries(words)) {
      if (new RegExp(`\\b${w}\\s+(?:ft|feet|foot)\\b`).test(l.norm)) return { ft: v, raw: `${w} feet` };
    }
  }
  return null;
}

/** first categorical site word from a value list present in the corpus. */
function firstSite(corpus: Corpus, sites: string[]): string | null {
  for (const l of corpus.lines) {
    for (const s of sites) if (contains(l.norm, s)) return s;
  }
  return null;
}

/** resolve a modifier-driven node (FALL_HEIGHT distance, PEN_SITE site). */
function evalModifierNode(node: LatticeNode, fam: LatticeFamily, ctx: WalkerCtx): NodeStatus {
  const mod: LatticeModifier | undefined = node.resolved_by_modifier
    ? fam.modifiers?.[node.resolved_by_modifier]
    : undefined;
  if (!mod) return 'ambiguous';

  if (node.resolved_by_modifier === 'distance') {
    const d = parseDistanceFt(ctx.corpus);
    if (d == null) return 'ambiguous';
    const thr = mod.threshold ?? 20;
    return d.ft > thr ? 'met' : 'not_met';
  }
  if (node.resolved_by_modifier === 'site') {
    const site = firstSite(ctx.corpus, mod.qualifying ?? []);
    if (site) return 'met';
    const nonq = firstSite(ctx.corpus, mod.non_qualifying ?? []);
    if (nonq) return 'not_met';
    return 'ambiguous';
  }
  return 'ambiguous';
}

/** compute the criterion status of a single node. */
function evalNode(node: LatticeNode, fam: LatticeFamily, ctx: CtxWithLattice): NodeStatus {
  // shape=predicate physiologic criteria: pure value predicates, auto-satisfy, never prompt.
  if (fam.shape === 'predicate' && node.predicate) {
    const r = ctx.evalPredicate(node.predicate);
    return r === true ? 'met' : 'not_met';
  }
  // delegated node (ANAT_PENETRATING -> PEN_SITE): defer to the delegate's family.
  if (node.shape === 'delegated' && node.delegates_to) {
    const [famId, nodeId] = node.delegates_to.split('.');
    const dFam = ctx._lattice.families.find((f) => f.id === famId);
    const dNode = dFam?.nodes.find((n) => n.id === nodeId);
    if (dFam && dNode && familyEntered(ctx.corpus, dFam)) return evalNode(dNode, dFam, ctx);
    return 'dormant';
  }
  // modifier-resolved node (empty affirm/negate on purpose).
  if (node.resolved_by_modifier) return evalModifierNode(node, fam, ctx);

  // affirm / negate lexicon node.
  const negated = node.negate?.length ? anyPresent(ctx.corpus, node.negate) : false;
  if (negated) return 'not_met';
  const affirmed = node.affirm?.length ? anyPresent(ctx.corpus, node.affirm) : false;
  if (affirmed) return 'met';
  return 'ambiguous';
}

interface ScoredNode {
  node: LatticeNode;
  fam: LatticeFamily;
  status: NodeStatus;
}

export function walk(lattice: ActivationLattice, base: WalkerCtx): WalkerResult {
  const ctx: CtxWithLattice = Object.assign({ _lattice: lattice }, base) as CtxWithLattice;

  const enteredFamilies = lattice.families.filter((f) => familyEntered(ctx.corpus, f));
  const enteredIds = new Set(enteredFamilies.map((f) => f.id));

  // families excluded by an entered family (MVC excludes FALL, etc.)
  const excluded = new Set<string>();
  for (const f of enteredFamilies) for (const x of f.excludes_families ?? []) excluded.add(x);

  const active = enteredFamilies.filter((f) => !excluded.has(f.id));

  // evaluate every node in active families
  const scored: ScoredNode[] = [];
  for (const fam of active) {
    for (const node of fam.nodes) scored.push({ node, fam, status: evalNode(node, fam, ctx) });
  }

  const statusById = new Map(scored.map((s) => [s.node.id, s.status]));
  const negatedIds = new Set(
    scored
      .filter((s) => s.status === 'not_met' && s.node.negate?.length && anyPresent(ctx.corpus, s.node.negate!))
      .map((s) => s.node.id),
  );

  // criteria met (criterion != null and status met)
  const criteriaMet = scored
    .filter((s) => s.status === 'met' && s.node.criterion)
    .map((s) => ({
      category: s.fam.axis,
      criterion: s.node.criterion as string,
      nodeId: s.node.id,
      evidence: firstMatch(ctx.corpus, s.node.affirm)?.raw ?? s.node.criterion ?? '',
    }));
  const anyCriterionSatisfied = criteriaMet.length > 0;
  const feeQualified = anyCriterionSatisfied;

  // ── prompt candidate selection ──
  const candidates = scored.filter((s) => {
    if (s.status !== 'ambiguous') return false;
    // human tapped "acknowledge / not now" on this branch -> stop re-prompting it
    if (ctx.dismissed?.has(s.node.id)) return false;
    // only nodes that carry a prompt/ask are promptable (flat presence checks are not)
    if (!s.node.prompt && !s.node.ask) return false;
    // settle: family lexicon just landed — don't interrupt a sentence
    const entSec = earliestPhraseSec(ctx.corpus, s.fam.enter_when.any_of ?? []);
    if (entSec != null && ctx.nowSec - entSec < ctx.settleMs / 1000) return false;
    // blocked: a depends_on dependency is still ambiguous
    if ((s.node.depends_on ?? []).some((d) => statusById.get(d) === 'ambiguous')) return false;
    // locked: node is unlocked only on negation of another node (on_negate.unlock)
    const lockedBy = scored.find((o) => o.node.on_negate?.unlock?.includes(s.node.id));
    if (lockedBy && !negatedIds.has(lockedBy.node.id)) return false;
    // materiality: qualification (qualifies_alone && !feeQualified) OR documentation (registry_required)
    const material = (s.node.qualifies_alone && !feeQualified) || s.node.registry_required;
    return material;
  });

  candidates.sort((a, b) => b.node.info_gain - a.node.info_gain || a.node.id.localeCompare(b.node.id));

  const top = candidates[0];
  let prompt: WalkerResult['prompt'] = null;
  if (top) {
    const distance = parseDistanceFt(ctx.corpus);
    const qualifyingCriterion = criteriaMet[0]?.criterion ?? 'a captured criterion';
    const isQual = top.node.qualifies_alone && !feeQualified;
    let text = (distance ? top.node.prompt : top.node.prompt_fallback ?? top.node.prompt) ?? top.node.ask ?? '';
    text = text.replace('{distance}', distance?.raw ?? '').replace('{qualifying_criterion}', qualifyingCriterion);
    const subline = isQual ? top.node.prompt_subline_qualification : top.node.prompt_subline_documentation;
    prompt = {
      nodeId: top.node.id,
      familyId: top.fam.id,
      text: text.trim(),
      subline: subline?.replace('{qualifying_criterion}', qualifyingCriterion),
      infoGain: top.node.info_gain,
    };
  }

  return {
    criteriaMet,
    anyCriterionSatisfied,
    prompt,
    enteredFamilies: [...enteredIds],
  };
}
