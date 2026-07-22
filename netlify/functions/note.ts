// netlify/functions/note.ts
// Agent 2 — Nurse's Note. The reason anyone presses "Generate report": it turns
// the captured event/value table into a signable nursing narrative (page 1).
// Model plumbing routes through callAgent (structured outputs, thinking disabled,
// retries) — see _shared/callAgent.ts. Doctrine + disclaimer/attestation are
// single-sourced from _shared/doctrine.ts.
//
// Input  (POST JSON): { events, values, notCaptured, caseId? }
// Output (JSON): { page1Narrative, page1NotCaptured, _disclaimer, attestation }
//
// THE HARD RULE, enforced in code: every narrative clause must cite ≥1 real captured
// id. Clauses citing nothing valid are DROPPED here — "no source → no sentence" is a
// server invariant, not just a prompt instruction. If the model returns no usable
// narrative, we fail clearly ({ error }) so the client falls back to the deterministic
// page-1 (buildReportModel).

import { DOCTRINE, DISCLAIMER, ATTESTATION } from './_shared/doctrine.ts';
import { callAgent, type JsonSchema } from './_shared/callAgent.ts';

// --- Nurse's-note-SPECIFIC rules stay inline; cross-cutting DOCTRINE imported. ---
const SYSTEM_PROMPT = `You turn a captured trauma-bay record into a signable nursing narrative — page 1 of the report.
Your inputs are a list of CAPTURED ITEMS (events and spoken values, each with an id and a timestamp) and a
list of DOCUMENTATION GAPS already identified upstream. You do NOT hear audio and you do NOT see a chart;
you only organize what was already captured into prose a nurse can read, correct, and sign. Synthetic data
only — never invent facts not present in the inputs.

THE HARD RULE — state only what was captured. Never infer, smooth over, or complete a gap with plausible
prose. Prose is persuasive in a way a table is not: a blank reads as missing, a fluent sentence reads as
true. You will WANT to write "the patient was placed on a monitor and vital signs were obtained" — if no
captured item says it, that is a FABRICATED medical-record entry. Fluency is not the goal; fluency is the
risk. A gap must look like a gap.

Every clause of the narrative MUST cite, in source_event_ids, the id(s) of the captured item(s) it came
from. This is the MECHANISM, not decoration: no source item → no sentence. A clause you cannot tie to a
captured id must not be written.

Group the narrative by timestamp into readable clauses in chronological order. Put the plain clause prose
in "text" — do NOT embed the timestamp in the text; it is carried separately in "t_rel" and the page renders
it as a subscript before the clause. Set "confidence" to "verbatim" when the clause repeats what was
captured, "paraphrase" when you reorganize captured facts into readable prose without adding any.

Do not conclude. Never state an outcome, a diagnosis, or an assessment. Transcribe and organize; do not
interpret. If capture says "GCS not assessable — sedated and paralyzed," write that; do NOT smooth it into
"stable post-intubation." The tool PRESENTS; a human SIGNS.

Never infer Age, Sex, or Weight from anything but a captured value item stating it outright.

For not_captured, reproduce the DOCUMENTATION GAPS you are given verbatim — these are the named gaps, and
the section is the honesty of the note. Do not invent gaps outside the provided list, and do not drop any.

${DOCTRINE}

Return the fields defined by the response schema.`;

// Structured-outputs schema (supported subset only).
const NOTE_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['note'],
  properties: {
    note: {
      type: 'object',
      additionalProperties: false,
      required: ['narrative', 'not_captured'],
      properties: {
        narrative: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['t_rel', 'text', 'source_event_ids', 'confidence'],
            properties: {
              t_rel: { type: 'string' },
              text: { type: 'string' },
              source_event_ids: { type: 'array', items: { type: 'string' } },
              confidence: { type: 'string', enum: ['verbatim', 'paraphrase'] },
            },
          },
        },
        not_captured: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['what', 'note'],
            properties: { what: { type: 'string' }, note: { type: 'string' } },
          },
        },
      },
    },
  },
};

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

function fmtT(sec: number): string {
  const s = Math.max(0, Math.round(sec || 0));
  return `T+${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

interface CapturedItem {
  id: string;
  t: number;
  t_rel: string;
  kind: 'event' | 'value';
  text: string;
}

/** Flatten events + values into one id-stamped source list the narrative must cite. */
function buildCapturedItems(
  events: Array<Record<string, unknown>>,
  values: Array<Record<string, unknown>>,
): CapturedItem[] {
  const items: CapturedItem[] = [];
  for (const e of events) {
    const id = typeof e?.id === 'string' ? e.id : '';
    const label = typeof e?.label === 'string' ? e.label : '';
    if (!id || !label) continue;
    const t = typeof e?.t === 'number' ? e.t : 0;
    items.push({ id, t, t_rel: fmtT(t), kind: 'event', text: label });
  }
  values.forEach((v, i) => {
    const name = typeof v?.name === 'string' ? v.name : '';
    if (!name) return;
    const t = typeof v?.t === 'number' ? v.t : 0;
    const raw = v?.value;
    const val = typeof raw === 'number' || typeof raw === 'string' ? String(raw) : '';
    const unit = typeof v?.unit === 'string' && v.unit ? ` ${v.unit}` : '';
    items.push({ id: `v-${i}`, t, t_rel: fmtT(t), kind: 'value', text: `${name} ${val}${unit}`.trim() });
  });
  return items.sort((a, b) => a.t - b.t);
}

export default async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST the end-state as JSON' }, 405);

  const body = (await req.json().catch(() => null)) as
    | { events?: unknown; values?: unknown; notCaptured?: unknown; caseId?: unknown }
    | null;

  const events = Array.isArray(body?.events) ? (body.events as Array<Record<string, unknown>>) : [];
  const values = Array.isArray(body?.values) ? (body.values as Array<Record<string, unknown>>) : [];
  const notCaptured = (Array.isArray(body?.notCaptured) ? body.notCaptured : [])
    .map((g) => {
      const o = (g ?? {}) as Record<string, unknown>;
      return { what: String(o.what ?? ''), note: String(o.note ?? '') };
    })
    .filter((g) => g.what);
  const caseId = typeof body?.caseId === 'string' ? body.caseId : 'SYN-0007';

  const items = buildCapturedItems(events, values);
  if (items.length === 0) {
    return json({ error: 'no captured items to narrate' }, 400);
  }
  const idT = new Map<string, number>(items.map((it) => [it.id, it.t]));

  const userContent =
    `Case: ${caseId}\n\n` +
    `CAPTURED ITEMS (the ONLY source material — cite these ids in source_event_ids):\n` +
    `${JSON.stringify(items.map((it) => ({ id: it.id, t_rel: it.t_rel, kind: it.kind, text: it.text })), null, 0)}\n\n` +
    `DOCUMENTATION GAPS already identified (reproduce verbatim in not_captured):\n` +
    `${notCaptured.length ? JSON.stringify(notCaptured, null, 0) : 'none'}`;

  const result = await callAgent<{ note?: { narrative?: unknown } }>({
    system: SYSTEM_PROMPT,
    user: userContent,
    schema: NOTE_SCHEMA,
    maxTokens: 2048,
  });

  if (!result.ok) return json({ error: result.error }, result.status ?? 502);

  const note = result.data.note;
  const rawNarrative = Array.isArray(note?.narrative)
    ? (note!.narrative as Array<Record<string, unknown>>)
    : [];

  // THE HARD RULE in code: keep only clauses that cite a real captured id.
  const page1Narrative: Array<{ t: number; text: string; sourceEventIds: string[] }> = [];
  for (const c of rawNarrative) {
    const clauseText = typeof c?.text === 'string' ? c.text.trim() : '';
    if (!clauseText) continue;
    const cited = Array.isArray(c?.source_event_ids) ? (c.source_event_ids as unknown[]) : [];
    const sourceEventIds = cited.filter((id): id is string => typeof id === 'string' && idT.has(id));
    if (sourceEventIds.length === 0) continue; // no source -> no sentence
    const t = Math.min(...sourceEventIds.map((id) => idT.get(id) as number));
    page1Narrative.push({ t, text: clauseText, sourceEventIds });
  }
  page1Narrative.sort((a, b) => a.t - b.t);

  if (page1Narrative.length === 0) {
    // model produced nothing groundable — let the client fall back to the deterministic floor
    return json({ error: 'no groundable narrative clauses returned' }, 502);
  }

  return json({
    page1Narrative,
    page1NotCaptured: notCaptured, // the ledger's gaps stay authoritative
    _disclaimer: DISCLAIMER,
    attestation: ATTESTATION,
  });
};
