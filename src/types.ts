/**
 * Trauma Tracker — frozen shared contract.
 *
 * FROZEN FIRST (buildable task #2). Every engine module imports from here.
 * `erasableSyntaxOnly` is on, so there are NO TS enums — states are string-literal
 * unions and const maps. `verbatimModuleSyntax` is on, so import these with `import type`.
 *
 * Ground truth: src/data/obligations.json, activation_lattice.json, charges.json,
 * trauma_scores.json, accreditation_measures.json.
 * All clinical values are consumed as flagged data (NEEDS-CLINICIAN / NEEDS-CODER); the
 * ENGINE SHAPE is decided, the clinical VALUES are not signed off.
 */

/* ────────────────────────────── time ────────────────────────────── */

/** Relative-to-activation timestamp as spoken by the recorder, e.g. "T+2:40". */
export type TRel = string;

/* ─────────────────────────── extraction ─────────────────────────── */

export type ItemKind = 'event' | 'value' | 'note';

/** One item emitted by the Extractor/Scribe (prompts/10_extractor_scribe.md). */
export interface ExtractedItem {
  type: ItemKind;
  t_rel: TRel;
  label: string;
  name?: string | null;
  value?: string | number | null;
  unit?: string | null;
  raw: string;
  uncertain?: boolean;
}

/** A timestamped line of transcript. We catalogue WHAT was said, never WHO said it. */
export interface Utterance {
  t_rel: TRel;
  atSec: number;
  text: string;
  /** true when the extractor (or canned fixture) has flagged this as low-confidence. */
  uncertain?: boolean;
}

/* ───────────────────────────── values ───────────────────────────── */

/** A single measurement / demographic, with when it was heard (staleness clock input). */
export interface ValueReading {
  name: string;
  value: number | string;
  unit?: string | null;
  heardAtSec: number;
  raw?: string;
}

/**
 * The derived value stream: latest reading per name plus the parsed scalars the
 * engine predicates read (SBP, iv_sites, iv_gauge, splint_site, …).
 */
export interface ValuesState {
  latest: Record<string, ValueReading>;
  /** systolic parsed from the most recent BP "88/54". */
  SBP: number | null;
  DBP: number | null;
  HR: number | null;
  RR: number | null;
  SpO2: number | null;
  GCS: number | null;
  gcsHistory: { atSec: number; value: number }[];
  Age: number | null;
  Sex: string | null;
  Weight: number | null;
  iv_sites: number | null;
  iv_gauge: number | null;
  prbc_units: number | null;
  splint_site: string | null;
  laceration_cm: number | null;
}

/* ───────────────────────────── scores ───────────────────────────── */

export interface ScoreSnapshot {
  GCS: number | null;
  shockIndex: number | null;
  RTS: number | null;
  /** age-dependent scores are compute:null pending clinician-verified coding. */
  MGAP: number | null;
  GAP: number | null;
}

export interface ScoreTimelinePoint extends ScoreSnapshot {
  t_rel: TRel;
  atSec: number;
  note?: string;
}

/* ───────────────────────── obligations ledger ───────────────────── */

/** The 6-state machine (obligations.json → state_machine.states). */
export type ObligationState =
  | 'dormant'
  | 'satisfied'
  | 'missing'
  | 'ambiguous'
  | 'not_applicable'
  | 'unresolved';

export type MaterialityArm = 'qualification' | 'documentation';

export type SubjectKind =
  | 'charge'
  | 'measure'
  | 'value_stream'
  | 'registry_field';

export interface ObligationSubject {
  kind: SubjectKind;
  ref?: string;
  rev?: string;
  cpt?: string;
  hcpcs?: string;
  [k: string]: unknown;
}

/** A single machine-checkable predicate inside a requires block. */
export interface Atom {
  id: string;
  affirm?: string[];
  predicate?: string;
  derived?: boolean;
  [k: string]: unknown;
}

export interface Requires {
  all_of?: Atom[];
  any_of?: Atom[];
  min_satisfied?: number;
}

export interface TriggerGuard {
  not_future_tense?: boolean;
  not_negated?: boolean;
  not_deferred?: boolean;
  min_tokens?: number;
}

export interface ClockSpec {
  start_on?: string[];
  stop_on?: string[];
  pause_during?: string[];
}

export interface CodeMapRow {
  when: string;
  cpt: string;
  label?: string;
}

export interface TerminalSpec {
  at: string;
  if_open: ObligationState;
  report?: string;
  dollar_impact?: number;
  gap_text?: string;
}

/** Typed view over one obligations.json row (annotation `_*` fields omitted). */
export interface ObligationDef {
  id: string;
  subject: ObligationSubject;
  label: string;
  trigger: {
    any_of?: string[];
    predicate?: string;
    ref?: string;
    when?: string;
  };
  trigger_guard?: TriggerGuard;
  requires: Requires;
  clock?: ClockSpec;
  code_map?: CodeMapRow[];
  idempotency_key?: string;
  material_for: MaterialityArm[];
  facility_precondition?: { predicate: string; [k: string]: unknown };
  preconditions?: Record<string, unknown>;
  prompt?: string;
  prompt_partial_etco2?: string;
  prompt_partial_bs?: string;
  terminal?: TerminalSpec;
  satisfies_measure?: string;
  [k: string]: unknown;
}

export interface ObligationCatalog {
  state_machine: Record<string, unknown>;
  obligations: ObligationDef[];
  not_charged_but_captured?: Record<string, unknown>;
}

/** Runtime evaluation of one obligation at the current `now`. */
export interface ObligationRuntime {
  id: string;
  label: string;
  subject: ObligationSubject;
  state: ObligationState;
  triggered: boolean;
  triggeredAtSec: number | null;
  atoms: { id: string; satisfied: boolean; source?: string }[];
  materialArms: MaterialityArm[];
  material: boolean;
  suppressed: boolean;
  suppressReason?: string;
  render: boolean;
  promptText?: string;
  cptSelected?: string | null;
  dollarImpact?: number;
  terminal?: TerminalSpec;
}

/* ─────────────────────── activation lattice ──────────────────────── */

export type ModifierRole = 'irrelevant' | 'qualifier' | 'registry_only';

export interface LatticeModifier {
  role: ModifierRole;
  applies_to_criterion: boolean;
  criterion_node?: string;
  threshold?: number;
  unit?: string;
  operator?: string;
  adult_only?: boolean;
  kind?: string;
  qualifying?: string[];
  non_qualifying?: string[];
  values?: Record<string, string[]>;
  [k: string]: unknown;
}

export interface LatticeNode {
  id: string;
  ask?: string;
  prompt?: string;
  prompt_fallback?: string;
  prompt_subline_documentation?: string;
  prompt_subline_qualification?: string;
  info_gain: number;
  criterion: string | null;
  qualifies_alone: boolean;
  registry_required: boolean;
  depends_on?: string[];
  affirm?: string[];
  negate?: string[];
  predicate?: string;
  source_field?: string;
  resolved_by_modifier?: string;
  evaluate?: {
    criterion_met_when?: string;
    criterion_not_met_when?: string;
    ambiguous_when?: string;
  };
  on_negate?: { unlock?: string[] };
  shape?: string;
  delegates_to?: string;
  [k: string]: unknown;
}

export interface LatticeFamily {
  id: string;
  axis: string;
  shape: string;
  label: string;
  enter_when: { any_of?: string[]; always?: boolean };
  enter_guard?: { not_preceded_by_negation?: boolean; note?: string };
  excludes_families?: string[];
  modifiers?: Record<string, LatticeModifier>;
  nodes: LatticeNode[];
  [k: string]: unknown;
}

export interface ActivationLattice {
  measure_id: string;
  qualification_rule: string;
  walker: Record<string, unknown>;
  families: LatticeFamily[];
  orphan_modifier_policy?: Record<string, unknown>;
  rule_table?: Record<string, unknown>;
}

/** The one node the walker elects to render (or none). */
export interface WalkerResult {
  criteriaMet: { category: string; criterion: string; nodeId: string; evidence: string }[];
  anyCriterionSatisfied: boolean;
  /** the single node to prompt, if any survived pruning + ranking. */
  prompt: {
    nodeId: string;
    familyId: string;
    text: string;
    subline?: string;
    infoGain: number;
  } | null;
  enteredFamilies: string[];
}

/* ───────────────────────────── charges ──────────────────────────── */

export interface ChargeItem {
  code: string;
  name: string;
  price: number;
  category: string;
  cpt: string | null;
  role_scope: string[];
  requires?: string[];
}

export type ChargeStatus =
  | 'billed'
  | 'held'
  | 'unresolved'
  | 'declined'
  | 'not_applicable'
  | 'dormant';

export interface ChargeRuntime {
  code: string;
  name: string;
  cpt: string | null;
  price: number;
  status: ChargeStatus;
  obligationId?: string;
  /** human-readable why, cited on page 2 (e.g. the CMS OCE edit for G0390). */
  reason?: string;
  citation?: string;
}

/* ─────────────────── activation fee determination ───────────────── */

export interface ActivationDetermination {
  qualifies: boolean;
  criteriaMet: { category: string; criterion: string; evidence: string }[];
  activationDocumented: boolean;
  teamResponded: boolean;
  prehospitalNotification: boolean;
  /** conditions still open at render time, printed AS open (never silently closed). */
  openConditions: string[];
  /** e.g. "rev 0681 reports; G0390 not billed — critical care < 30 min". */
  feeDisposition: string;
}

/* ───────────────────────────── measures ─────────────────────────── */

export interface MeasureResult {
  id: string;
  name: string;
  status: 'met' | 'open' | 'missed' | 'not_applicable';
  targetMin?: number;
  elapsedMin?: number;
  detail?: string;
}

/* ─────────────────────────────── gaps ───────────────────────────── */

export interface Gap {
  obligationId: string;
  label: string;
  text: string;
  dollarImpact?: number;
}

/* ─────────────────────── the active prompt ──────────────────────── */

export interface ActivePrompt {
  source: 'ledger' | 'lattice';
  obligationId?: string;
  nodeId?: string;
  text: string;
  subline?: string;
}

/* ─────────────────────────── engine state ───────────────────────── */

export interface EngineConfig {
  settleMs: number;
  cooldownS: number;
  maxPrompts: number;
  facilityTraumaDesignation: string;
  /**
   * Decision #7 (unreconciled in the source). Configurable so the page-2 surface
   * stays internally consistent whichever way the founder rules.
   *  - 'decline_with_citation': G0390/99291 shown declined at $0 with the OCE-edit citation.
   *  - 'unattributed_pending':  activation shown as one unattributed determination (ADR-0014 text).
   */
  g0390Mode: 'decline_with_citation' | 'unattributed_pending';
  /** disposition sweep time (seconds); open+material obligations become `unresolved`. */
  dispositionSec: number;
}

/** The full deterministic recompute at a given `now`. Prompts are a pure render of this. */
export interface EngineState {
  nowSec: number;
  values: ValuesState;
  scores: ScoreSnapshot;
  scoreTimeline: ScoreTimelinePoint[];
  obligations: ObligationRuntime[];
  activePrompt: ActivePrompt | null;
  charges: ChargeRuntime[];
  estimatedTotal: number;
  activation: ActivationDetermination;
  measures: MeasureResult[];
  gaps: Gap[];
  resuscitationActive: boolean;
}
