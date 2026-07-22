/**
 * The ONE live model call — Extractor / Scribe (prompts/10_extractor_scribe.md).
 *
 * Holds the Anthropic key server-side; the browser never sees it. Turns a transcript
 * window into structured items. Called via /.netlify/functions/claude from the client
 * (and mounted in dev by the vite plugin in vite.config.ts).
 *
 * Model plumbing routes through callAgent (structured outputs -> guaranteed-parseable
 * JSON, thinking disabled, retries) — see _shared/callAgent.ts. Cross-cutting doctrine
 * is single-sourced from _shared/doctrine.ts. Request/response contract unchanged:
 * POST { transcript } -> { items: ExtractedItem[] }.
 */

import { DOCTRINE } from './_shared/doctrine.ts';
import { callAgent, type JsonSchema } from './_shared/callAgent.ts';

const EXTRACTOR_SYSTEM = `You extract discrete clinical events, spoken values, and interventions from a live trauma-bay audio transcript. Multiple people are speaking; you do NOT identify who — you catalogue WHAT was said. Synthetic data only; never infer facts not present in the transcript.

You are given a list of items ALREADY CAPTURED. Emit ONLY new items found in the new transcript window; never re-emit an item already in the provided list.

For each new transcript segment, emit events. Use ONLY what is stated. Mark anything ambiguous as "uncertain": true rather than guessing. Timestamps are relative to activation (T+MM:SS) as spoken by the recorder; if a segment has no explicit time, attach it to the most recent stated time.

Emit three kinds of items:
1. event — an intervention/assessment/decision (intubation, FAST, chest tube, activation).
2. value — a discrete measurement or stated demographic (vital, lab, score, Age, Sex, Weight). Populate name, value, unit.
3. note — clinically relevant context that isn't an event or value.

Do not compute scores. Do not assign charges. Faithful capture only.

Guardrails:
- Never emit a value the transcript didn't state (no normal-range hallucination).
- Preserve the verbatim raw phrase.
- Never infer Age, Sex, or Weight from a voice, a name, or pronouns. Emit them only when stated outright.
  Example: "thirty-four-year-old male" → emit a value Sex=male; a room that only says "he" has NOT stated a sex.
- When a blood pressure is stated ("88 over 54" or "88/54"), emit SEPARATE SBP and DBP values (SBP=88, DBP=54).
- If nothing extractable, return {"items": []}. For an event or note, leave name "".

${DOCTRINE}

Return the fields defined by the response schema.`;

// Structured-outputs schema (supported subset: object/array/string/number/boolean/enum,
// additionalProperties:false, required on every object). `value` is a string; the client
// engine (values.ts) parses numerics — no anyOf needed.
const EXTRACTOR_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 't_rel', 'label', 'name', 'value', 'unit', 'raw', 'uncertain'],
        properties: {
          type: { type: 'string', enum: ['event', 'value', 'note'] },
          t_rel: { type: 'string' },
          label: { type: 'string' },
          name: { type: 'string' },
          value: { type: 'string' },
          unit: { type: 'string' },
          raw: { type: 'string' },
          uncertain: { type: 'boolean' },
        },
      },
    },
  },
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let windowText = '';
  let priorItems: unknown[] = [];
  try {
    const b = (await req.json()) as { windowText?: string; priorItems?: unknown[] };
    windowText = b.windowText ?? '';
    priorItems = Array.isArray(b.priorItems) ? b.priorItems : [];
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }
  if (!windowText.trim()) return json({ items: [] });

  // Fix 1 (compute fat): only the new window + a compact list of already-captured items
  // go over the wire, and the model emits only new items — bounded tokens across a run.
  const user =
    `Items ALREADY CAPTURED (do NOT re-emit):\n${priorItems.length ? JSON.stringify(priorItems) : 'none'}\n\n` +
    `New transcript window:\n${windowText}`;

  const result = await callAgent<{ items?: unknown[] }>({
    system: EXTRACTOR_SYSTEM,
    user,
    schema: EXTRACTOR_SCHEMA,
    maxTokens: 1500,
  });

  if (!result.ok) return json({ error: result.error }, result.status ?? 502);
  return json({ items: Array.isArray(result.data.items) ? result.data.items : [] });
};
