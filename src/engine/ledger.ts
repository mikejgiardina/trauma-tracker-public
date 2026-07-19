/**
 * The obligations ledger.
 *
 * One ObligationRuntime per catalog row. A prompt is nothing but an open, material,
 * un-suppressed obligation rendered — computed here, never scheduled. Clocks only
 * flip material(); they never render (BUILD_SPEC / OBLIGATIONS_MODEL).
 *
 * render(o) <=> state in {missing, ambiguous} AND material(o) AND NOT suppressed(o)
 */

import type {
  Atom,
  ObligationDef,
  ObligationRuntime,
  ObligationState,
  Requires,
  ValuesState,
} from '../types.ts';
import type { Corpus } from './matcher.ts';
import type { ClockState } from './clocks.ts';
import { deferralSpokenFor, firstMatch } from './matcher.ts';
import { deadlineElapsed } from './clocks.ts';
import { evalPredicate, type EvalContext } from './predicates.ts';

export interface LedgerCtx {
  corpus: Corpus;
  values: ValuesState;
  clocks: ClockState;
  nowSec: number;
  resuscitationActive: boolean;
  latticeAnyCriterion: boolean;
  /** state of every obligation from the previous fixpoint pass (for cross-refs). */
  obligationStates: Record<string, ObligationState>;
  /** obligations the human has dismissed/deferred at the prompt surface. */
  dismissed: Set<string>;
  settleMs: number;
}

interface AtomEval {
  id: string;
  satisfied: boolean;
  flagged: boolean; // predicate returned 'unknown' (NEEDS-CODER/CLINICIAN) — counts as satisfied-but-flagged
  source?: string;
}

function predCtx(c: LedgerCtx): EvalContext {
  return {
    values: c.values,
    nowSec: c.nowSec,
    resuscitationActive: c.resuscitationActive,
    obligationStates: c.obligationStates,
    criticalCareAccruedMin: c.clocks.criticalCareAccruedMin,
    latticeAnyCriterion: c.latticeAnyCriterion,
  };
}

/** the rulebook flags some sub-atoms as documentation-only ("may not be spoken aloud"). */
function isNonGating(atom: Atom): boolean {
  const note = String((atom as { _note?: unknown })._note ?? '');
  return /may not be spoken|informational|likely unresolved/i.test(note);
}

/** an atom is satisfied if its affirm lexicon is present OR its predicate holds (unknown = flagged-satisfied). */
function evalAtom(atom: Atom, c: LedgerCtx): AtomEval {
  const affirmHit = atom.affirm?.length ? firstMatch(c.corpus, atom.affirm) : null;
  if (affirmHit) return { id: atom.id, satisfied: true, flagged: false, source: affirmHit.raw };
  if (atom.predicate) {
    const r = evalPredicate(atom.predicate, predCtx(c));
    if (r === 'unknown') return { id: atom.id, satisfied: true, flagged: true };
    if (r === true) return { id: atom.id, satisfied: true, flagged: false };
    if (isNonGating(atom)) return { id: atom.id, satisfied: true, flagged: true };
    return { id: atom.id, satisfied: false, flagged: false };
  }
  // affirm-only atom the rulebook marks as documentation-only: non-gating but flagged
  if (isNonGating(atom)) return { id: atom.id, satisfied: true, flagged: true };
  return { id: atom.id, satisfied: false, flagged: false };
}

function evalRequires(req: Requires, c: LedgerCtx): { atoms: AtomEval[]; satisfiedCount: number; total: number; met: boolean } {
  if (req.all_of) {
    const atoms = req.all_of.map((a) => evalAtom(a, c));
    const satisfiedCount = atoms.filter((a) => a.satisfied).length;
    return { atoms, satisfiedCount, total: atoms.length, met: satisfiedCount === atoms.length };
  }
  if (req.any_of) {
    const atoms = req.any_of.map((a) => evalAtom(a, c));
    const satisfiedCount = atoms.filter((a) => a.satisfied).length;
    const min = req.min_satisfied ?? 1;
    return { atoms, satisfiedCount, total: atoms.length, met: satisfiedCount >= min };
  }
  return { atoms: [], satisfiedCount: 0, total: 0, met: true };
}

/** trigger + trigger_guard → { triggered, atSec }. */
function evalTrigger(def: ObligationDef, c: LedgerCtx): { triggered: boolean; atSec: number | null } {
  const t = def.trigger;
  if (t.any_of) {
    const hit = firstMatch(c.corpus, t.any_of, def.trigger_guard);
    return { triggered: !!hit, atSec: hit?.atSec ?? null };
  }
  if (t.predicate) {
    const r = evalPredicate(t.predicate, predCtx(c));
    // resuscitation_active === true is the common value-stream trigger
    return { triggered: r === true, atSec: c.clocks.activationAtSec };
  }
  if (t.ref && t.when) {
    return {
      triggered: c.obligationStates[t.ref] === (t.when as ObligationState),
      atSec: c.clocks.activationAtSec,
    };
  }
  return { triggered: false, atSec: null };
}

/** materiality, gated by any clock the obligation declares (staleness / deadline). */
function isMaterial(def: ObligationDef, state: ObligationState, c: LedgerCtx): boolean {
  const arms = def.material_for ?? [];
  if (arms.length === 0) return false; // e.g. OBL-REG-DEMOGRAPHICS: charts + reports, never prompts
  if (state === 'satisfied' || state === 'not_applicable' || state === 'dormant') return false;

  const reRaise = (def as { re_raise?: { on?: string[]; deadline_min?: number } }).re_raise;
  const on = reRaise?.on ?? [];
  if (on.includes('staleness')) return c.clocks.vitalsStale; // clock flips materiality
  if (on.includes('deadline')) {
    const min = reRaise?.deadline_min ?? 10;
    return deadlineElapsed(c.clocks.activationAtSec, min, c.nowSec);
  }
  return true;
}

/** pick the prompt text, narrowing to the half that is actually absent (AWY-ETI). */
function promptFor(def: ObligationDef, atoms: AtomEval[], state: ObligationState): string | undefined {
  if (state !== 'missing' && state !== 'ambiguous') return undefined;
  if (def.id === 'OBL-AWY-ETI-CONFIRM' && state === 'ambiguous') {
    const etco2 = atoms.find((a) => a.id === 'etco2')?.satisfied;
    const bs = atoms.find((a) => a.id === 'bilat_bs')?.satisfied;
    if (etco2 && !bs) return def.prompt_partial_bs;
    if (bs && !etco2) return def.prompt_partial_etco2;
  }
  return def.prompt;
}

/** evaluate a code_map `when` string against the value stream (targeted, not eval()). */
function matchCodeMapWhen(when: string, values: ValuesState): boolean {
  // splint / penetrating: "site in ['thigh','femur',...]"
  const inMatch = /site in \[([^\]]*)\]/.exec(when);
  if (inMatch) {
    const list = inMatch[1].split(',').map((s) => s.replace(/['"\s]/g, ''));
    return values.splint_site != null && list.includes(values.splint_site);
  }
  // EKG default: needs a tracing AND an interpretation — 93000 global
  if (/tracing AND interpretation/.test(when)) return true;
  // wound axes require tier + length that are never spoken -> unresolvable
  if (/tier=|length/.test(when)) return false;
  return false;
}

function selectCpt(def: ObligationDef, state: ObligationState, values: ValuesState): string | null {
  if (def.code_map?.length) {
    if (state !== 'satisfied') return null; // can't pick a code until the gate resolves
    for (const row of def.code_map) if (matchCodeMapWhen(row.when, values)) return row.cpt;
    return null;
  }
  const cpt = def.subject.cpt;
  if (!cpt || /PENDING|NEEDS/i.test(cpt)) return null;
  return cpt;
}

function dollarImpact(def: ObligationDef): number | undefined {
  return def.terminal?.dollar_impact;
}

export function evalObligation(def: ObligationDef, c: LedgerCtx): ObligationRuntime {
  const { triggered, atSec } = evalTrigger(def, c);

  if (!triggered) {
    return {
      id: def.id,
      label: def.label,
      subject: def.subject,
      state: 'dormant',
      triggered: false,
      triggeredAtSec: null,
      atoms: [],
      materialArms: def.material_for ?? [],
      material: false,
      suppressed: false,
      render: false,
      cptSelected: null,
    };
  }

  const { atoms, satisfiedCount, met } = evalRequires(def.requires, c);

  let state: ObligationState;
  if (met) state = 'satisfied';
  else if (satisfiedCount === 0) state = 'missing';
  else state = 'ambiguous';

  // human said "hold that / not now" about this obligation's trigger -> respect the decline
  const trigPhrases = def.trigger.any_of ?? [];
  const humanDeferred = c.dismissed.has(def.id) || deferralSpokenFor(c.corpus, trigPhrases);

  const material = isMaterial(def, state, c);

  // settle: don't render a prompt for an obligation whose trigger fired < settle_ms ago
  const settleActive = atSec != null && c.nowSec - atSec < c.settleMs / 1000;

  const promptText = promptFor(def, atoms, state);
  const suppressed = humanDeferred || settleActive || !promptText;
  const render = (state === 'missing' || state === 'ambiguous') && material && !suppressed;

  const cptSelected = selectCpt(def, state, c.values);

  return {
    id: def.id,
    label: def.label,
    subject: def.subject,
    state,
    triggered: true,
    triggeredAtSec: atSec,
    atoms: atoms.map((a) => ({ id: a.id, satisfied: a.satisfied, source: a.source })),
    materialArms: def.material_for ?? [],
    material,
    suppressed,
    suppressReason: humanDeferred ? 'human_deferred' : settleActive ? 'settle' : undefined,
    render,
    promptText: render ? promptText : undefined,
    cptSelected,
    dollarImpact: dollarImpact(def),
    terminal: def.terminal,
  };
}

export function evalLedger(defs: ObligationDef[], c: LedgerCtx): ObligationRuntime[] {
  return defs.map((d) => evalObligation(d, c));
}
