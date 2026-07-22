// netlify/functions/note.ts
// Nurse's note — INCREMENTAL. One call composes ONE sentence for a SINGLE captured
// timeline row, given the previous 1-2 sentences as context (flow + dedup). The client
// calls this per event as the resus runs and accumulates the narrative, so there is no
// big end-of-case call to hit a timeout / character / reply limit. Model plumbing routes
// through callAgent (structured outputs, thinking disabled, retries).
//
// Input  (POST JSON): { row: { t_rel, label, text? }, prev?: string[] }
// Output (JSON):      { sentence: string }   ("" when the row adds nothing new)

import { DOCTRINE } from './_shared/doctrine.ts';
import { callAgent, type JsonSchema } from './_shared/callAgent.ts';

const SYSTEM = `You write ONE sentence of a nurse's transcription note for a SINGLE captured trauma-bay event.
You are given the event (its time and what was captured) and the previous 1-2 sentences already written.

Write one plain, factual, past-tense clause — the kind of line a nurse drops into a paper chart. State
ONLY what this event captured; never infer, never add a vital sign, action, or assessment not present in
the event. Do NOT embed the timestamp in the sentence (it is rendered separately). Do NOT conclude,
diagnose, or interpret.

Do not repeat what the previous sentences already say. If this event adds nothing new beyond them (a
readback, a duplicate, a restatement), return an EMPTY sentence.

${DOCTRINE}`;

const SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['sentence'],
  properties: { sentence: { type: 'string' } },
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let row: { t_rel?: string; label?: string; text?: string } | undefined;
  let prev: string[] = [];
  try {
    const b = (await req.json()) as { row?: typeof row; prev?: unknown };
    row = b.row;
    prev = Array.isArray(b.prev) ? (b.prev as unknown[]).filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }
  if (!row || typeof row.label !== 'string' || !row.label) return json({ sentence: '' });

  const user =
    `Previous sentences (context — do not repeat these):\n${prev.length ? prev.map((p, i) => `${i + 1}. ${p}`).join('\n') : 'none'}\n\n` +
    `New event @ ${row.t_rel ?? '?'}: ${row.text || row.label}`;

  const result = await callAgent<{ sentence?: string }>({
    system: SYSTEM,
    user,
    schema: SCHEMA,
    maxTokens: 200,
  });

  if (!result.ok) return json({ error: result.error }, result.status ?? 502);
  return json({ sentence: typeof result.data.sentence === 'string' ? result.data.sentence : '' });
};
