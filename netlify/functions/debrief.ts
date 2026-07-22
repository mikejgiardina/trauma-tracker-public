// netlify/functions/debrief.ts
// Generic post-report agent runner (Agents 3+). ONE function, a prompt REGISTRY:
// adding an agent = adding a registry entry (system + maxTokens + schema) — no new
// plumbing, no new endpoint. POST { agent: "<key>", input: {...} } -> the agent's
// JSON, verbatim.
//
// All model plumbing routes through callAgent (structured outputs, thinking
// disabled, retries) — see _shared/callAgent.ts. The cross-cutting DOCTRINE is
// single-sourced from _shared/doctrine.ts and appended to every agent prompt.
//
// These agents are strictly additive (AGENT_LINEUP.md): they run after "Generate
// report" and can fail without breaking anything, so the server does NOT enforce
// per-agent invariants the way note.ts does — it returns the JSON or a clear
// { error } and the client shows the section or doesn't.

import { DOCTRINE } from './_shared/doctrine.ts';
import { callAgent, type JsonSchema } from './_shared/callAgent.ts';

// --- schema builders (structured-outputs supported subset only) --------------
const S: JsonSchema = { type: 'string' };
const B: JsonSchema = { type: 'boolean' };
const N: JsonSchema = { type: 'number' };
const arr = (items: JsonSchema): JsonSchema => ({ type: 'array', items });
const enm = (...vals: string[]): JsonSchema => ({ type: 'string', enum: vals });
const obj = (properties: Record<string, JsonSchema>): JsonSchema => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const band = enm('low', 'moderate', 'high');

const HOT_DEBRIEF_SCHEMA = obj({
  hot_debrief: obj({
    summary: S,
    participants_heard: arr(obj({ role: S, evidence_t_rel: S })),
    went_well: arr(obj({ what: S, evidence_t_rel: S })),
    challenges: arr(obj({ what: S, evidence_t_rel: S, framing: S })),
    system_issues: arr(obj({ what: S, evidence_t_rel: S })),
    ems_handoff: obj({ mode: enm('ground', 'flight', 'not_heard'), report_received: S, worth_examining: arr(S) }),
    action_points: arr(obj({ point: S, owner_role: S })),
    closed_loop_quality: obj({
      orders_with_readback: N,
      orders_without_readback: arr(obj({ order: S, t_rel: S })),
      note: S,
    }),
  }),
  exposure_handoff: obj({ observed_factors: arr(obj({ factor: S, evidence: S, t_rel: S })) }),
});

const EXPOSURE_BADGE_SCHEMA = obj({
  _disclaimer: S,
  incident: obj({
    case_id: S,
    exposure_factors: arr(obj({
      factor: S,
      category: enm('mechanism_injury', 'treatments', 'patient_demographics', 'patient_actions', 'staff_moral_injury', 'context'),
      present: B,
      evidence: S,
      t_rel: S,
    })),
    incident_load: band,
    impact_likelihood: band,
    band_rationale: S,
  }),
  critical_incident: obj({ flagged: B, categories: arr(S), rationale: S }),
  crew: arr(obj({
    staff_id: S,
    role: S,
    this_incident: band,
    trailing_90d: obj({ incidents: N, high_band: N, note: S }),
    badge_state: enm('nominal', 'elevated', 'review_window'),
  })),
  resources: obj({ framing: S, note: S }),
  leadership: obj({
    aggregate_observations: arr(S),
    questions_worth_asking: arr(S),
    resources_that_exist: arr(S),
    tips: arr(S),
  }),
});

const CDI_QUERY_SCHEMA = obj({
  _disclaimer: S,
  queries: arr(obj({
    gap: S,
    clinical_indicators: arr(obj({ indicator: S, t_rel: S, source_ids: arr(S) })),
    query_text: S,
    answer_options: arr(S),
    addressed_to_role: S,
    rationale_for_cdi_reviewer: S,
  })),
  skipped: arr(obj({ gap: S, why_not_query_worthy: S })),
});

const PRIOR_AUTH_SCHEMA = obj({
  _disclaimer: S,
  determinations: arr(obj({
    charge: S,
    determination: enm('no_auth_required', 'notification_required', 'auth_required', 'insufficient_documentation'),
    policy_ref: S,
    policy_basis: S,
    evidence: arr(obj({ what: S, t_rel: S })),
    missing: S,
    deadline: S,
  })),
  summary: obj({
    no_auth_required: N,
    notification_required: N,
    auth_required: N,
    insufficient_documentation: N,
  }),
});

const DENIAL_APPEAL_SCHEMA = obj({
  _disclaimer: S,
  appeal: obj({
    case_id: S,
    charge: S,
    denial_reason: S,
    grounds: arr(S),
    narrative: arr(obj({ text: S, citations: arr(S) })),
    evidence_exhibits: arr(obj({ exhibit: S, source: S })),
    requested_action: S,
  }),
  attestation: S,
});

// --- Prompt registry (hack/prompts/agent3_*.md, agent4_*.md operationalized) ---
// Each agent's "Output JSON shape" prose is gone — the schema enforces it now.
const AGENTS: Record<string, { system: string; maxTokens: number; schema: JsonSchema }> = {
  hot_debrief: {
    maxTokens: 3072,
    schema: HOT_DEBRIEF_SCHEMA,
    system: `You run the immediate post-resus HOT DEBRIEF for frontline staff — everyone in the bay (nursing,
trauma/surgery, residents, CST, respiratory, lab, blood bank, XR, case management, social services) and
EMS ground/flight. Standard hot-debrief structure: summarize; things that went well (highs); challenges
(lows, framed as questions); system issues (equipment/process/resource problems AS VOICED in the room);
action points as opportunities owned by a ROLE, never a name. This is a debrief, NOT clinical decision
support: surface patterns, ask questions, never direct care. Blame-free — a challenge belongs to the
event, not a person. participants_heard lists ONLY roles evidenced in the transcript, never an expected
roster. Include the EMS handoff review (mode ground|flight|not_heard) grounded in what the room heard;
if no EMS report appears, mode is not_heard and the other keys STAY with empty values — never drop keys.
Also emit exposure_handoff.observed_factors — verbatim-evidenced stressor factors (no bands, no
interpretation; a downstream step assigns bands). An observed factor is something said or done, never an
inferred feeling: "patient screaming during line placement" qualifies (observed/done); "the RN was
distressed" does NOT (inferred internal state), even anchored to a real quote.

${DOCTRINE}`,
  },

  exposure_badge: {
    maxTokens: 3072,
    schema: EXPOSURE_BADGE_SCHEMA,
    system: `You produce the EMOTIONAL IMPACT ASSESSMENT (exposure badge) for LEADERSHIP — the aggregate view.
The metaphor is a radiation dosimeter: it MEASURES dose against a threshold; it never diagnoses, never
prescribes. You consume the debrief's observed_factors handoff plus transcript/events and a SYNTHETIC
staff roster. Categorize each factor on the ladder: mechanism_injury | treatments | patient_demographics
| patient_actions | staff_moral_injury | context. Moral-injury factors require an OBSERVABLE marker
(something said aloud); never inferred. An observed factor is something said or done, never an inferred
feeling: "patient screaming during line placement" qualifies (observed/done); "the RN was distressed"
does NOT (inferred internal state), even anchored to a real quote. Assign incident_load and
impact_likelihood as BANDS (low|moderate|high) — never a number. Flag critical_incident using standard
ICISF/CISM critical-incident categories (classify the EVENT, never a person). Per-crew badges:
this_incident band, trailing_90d SYNTHETIC HISTORY echoed as given, badge_state
nominal|elevated|review_window derived from bands only. The badge belongs to the wearer: individual dose
is the individual's; only the aggregate goes to the program. leadership content is aggregate-only:
pattern observations, questions worth asking, resources that EXIST (name CISM/peer-support paths; never
assign them), tips that are never "this person/crew needs X." MEASURE, NEVER PRESCRIBE. Set _disclaimer
to: "SYNTHETIC. Fictional staff, fabricated history. Not a screening tool, not a diagnostic, not a
clinical assessment. Exposure measurement only." resources.framing is "These exist. They are yours to
use or not."

${DOCTRINE}`,
  },

  // ── journey agents (JOURNEY_AGENTS.md judgment seats 6-8) — revenue-cycle tail ──

  cdi_query: {
    maxTokens: 2048,
    schema: CDI_QUERY_SCHEMA,
    system: `You are the CDI (clinical documentation integrity) query DRAFTER. Inputs: captured chart evidence
(events, values), charge lines, and obligation end-states (the documentation gaps). Decide which gaps are
QUERY-WORTHY — clarification would change code assignment, severity capture, or registry accuracy — and
draft a compliant physician query for each; SKIP the rest with a reason. Compliance is the product,
industry non-leading query practice: present clinical indicators VERBATIM from the record (each cited
t_rel + source ids); ask an OPEN question; answer_options are multiple-choice and ALWAYS include "other
(please specify)" and "clinically unable to determine"; NEVER suggest a diagnosis; the query_text NEVER
mentions reimbursement, DRG, severity scores, or financial impact — impact may be discussed only in
rationale_for_cdi_reviewer (reviewer-facing). Address queries to a role, never a name. Never draft a
query on a gap with zero captured indicators. You DRAFT; a CDI specialist reviews before any physician
sees it. Set _disclaimer to: "AI-GENERATED DRAFT. Queries require CDI-specialist review before physician
delivery. Synthetic demo, no PHI."

${DOCTRINE}`,
  },

  prior_auth: {
    maxTokens: 2048,
    schema: PRIOR_AUTH_SCHEMA,
    system: `You are the prior-authorization / payer-policy eligibility reader. Inputs: charge lines (all
statuses), captured evidence, and a SYNTHETIC payer-policy set (policy objects with ids + rule text).
For each charge, READ the provided policies and determine: no_auth_required (incl. the emergency
exemption — stabilizing emergency care is exempt from prior auth under prudent-layperson/EMTALA-style
rules; the ED encounter's real work is NOTIFICATION duties and documentation sufficiency),
notification_required (with the window from the policy text), auth_required (non-emergent downstream
services), or insufficient_documentation (say exactly what the policy needs that the record lacks —
never default to approved when the record is silent). A determination is a POLICY READ of the provided
synthetic text, never an assertion of coverage or payment — staff verify against the live payer. Quote
the policy basis; cite captured evidence; never invent a policy, rule, or deadline. Leave "missing" ""
except for insufficient_documentation, and "deadline" "" unless the policy states one. Set _disclaimer
to: "SYNTHETIC payer policies. Policy reads, not coverage or payment determinations. Staff verify against
the live payer. Synthetic demo, no PHI."

${DOCTRINE}`,
  },

  denial_appeal: {
    maxTokens: 3072,
    schema: DENIAL_APPEAL_SCHEMA,
    system: `You draft the DENIAL-APPEAL narrative. Inputs: one denial object (charge, payer, denial reason —
synthetic), captured chart evidence (events, values, criteria met, measures), and any provided
policy/criteria text. Build the appeal STRICTLY from the record: restate the denial; state the grounds;
write the narrative one factual sentence at a time, EVERY sentence carrying at least one citation
(t_rel / event id / provided policy ref) — no citation, no sentence, same mechanism as the nurse's note.
Quote policy text only from the provided input. List evidence exhibits a reviewer should pull. Tone:
factual, specific, respectful — zero adjectives doing the work evidence should do. Never assert the
appeal will succeed or that the payer acted in bad faith — argue the record. This is a DRAFT: the
attestation block is always present; authorized revenue-cycle staff review and sign before submission.
Set _disclaimer to: "AI-GENERATED DRAFT appeal. Requires revenue-cycle review and authorized signature
before submission. Synthetic demo, no PHI." Set attestation to: "DRAFT — AI-GENERATED. Not submitted.
Requires review and signature by authorized revenue-cycle staff. Synthetic demo — no PHI."

${DOCTRINE}`,
  },
};

// Synthetic payer-policy set for the prior-auth agent (provided when the client doesn't send one).
const SYNTHETIC_POLICIES = [
  { id: 'SYN-PLAN-A §1', rule: 'Emergency services: prior authorization is not required for emergency services provided to stabilize an emergency medical condition (prudent layperson standard).' },
  { id: 'SYN-PLAN-A §2', rule: 'Inpatient admission from the emergency department requires plan notification within 24 hours of admission or the next business day.' },
  { id: 'SYN-PLAN-A §3', rule: 'Advanced imaging (CT, MRI) performed during an emergency department encounter requires no prior authorization; documentation must state the clinical indication.' },
  { id: 'SYN-PLAN-A §4', rule: 'Post-acute services (inpatient rehabilitation, skilled nursing) require prior authorization before transfer.' },
  { id: 'SYN-PLAN-A §5', rule: 'Blood products administered emergently require no authorization; units transfused must be documented in the record.' },
];

// Synthetic demo roster — the radiation-tag beat: SYN-RN-02 is the deliberately
// frequent-exposure callout the printout surfaces (AGENT_LINEUP Agent 4).
const SYNTHETIC_ROSTER = [
  { staff_id: 'SYN-RN-02', role: 'Primary RN', trailing_90d: { incidents: 14, high_band: 3, note: 'SYNTHETIC HISTORY' } },
  { staff_id: 'SYN-MD-01', role: 'Trauma Lead', trailing_90d: { incidents: 9, high_band: 1, note: 'SYNTHETIC HISTORY' } },
  { staff_id: 'SYN-RT-01', role: 'Respiratory Therapist', trailing_90d: { incidents: 5, high_band: 0, note: 'SYNTHETIC HISTORY' } },
  { staff_id: 'SYN-REC-01', role: 'Recorder RN', trailing_90d: { incidents: 11, high_band: 2, note: 'SYNTHETIC HISTORY' } },
];

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

export default async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST { agent, input } as JSON' }, 405);

  const body = (await req.json().catch(() => null)) as { agent?: unknown; input?: unknown } | null;
  const agentKey = typeof body?.agent === 'string' ? body.agent : '';
  const spec = AGENTS[agentKey];
  if (!spec) {
    return json({ error: `unknown agent "${agentKey}" — known: ${Object.keys(AGENTS).join(', ')}` }, 400);
  }

  const input = (body?.input ?? {}) as Record<string, unknown>;
  // Provide the synthetic sets when the client doesn't send its own.
  if (agentKey === 'exposure_badge' && input.roster == null) input.roster = SYNTHETIC_ROSTER;
  if (agentKey === 'prior_auth' && input.policies == null) input.policies = SYNTHETIC_POLICIES;

  const result = await callAgent({
    system: spec.system,
    user: `INPUTS (the only source material):\n${JSON.stringify(input)}`,
    schema: spec.schema,
    maxTokens: spec.maxTokens,
  });

  if (!result.ok) return json({ error: result.error }, result.status ?? 502);
  return json(result.data);
};
