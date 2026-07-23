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

const SYSTEM = `You compose ONE sentence of a trauma nurse's narrative note for a SINGLE captured event. You
are given the event (what was captured) and the previous 1-2 sentences already written, for flow and to
avoid repeating.

VOICE — write like an experienced trauma nurse charting a clean narrative note: a complete, articulate,
professionally phrased sentence in the past tense, using correct clinical terminology. Not clipped chart
shorthand, not a sentence fragment. Elevate the phrasing while staying strictly factual — e.g. render
"IV access x2, 16-gauge" as "Bilateral peripheral intravenous access was established with two 16-gauge
catheters," and "FAST positive Morrison's pouch" as "A focused assessment with sonography for trauma was
positive for free fluid in the hepatorenal recess."

HARD RULE — NEVER put a time in the sentence. No "T+1:35", no clock time, no "at that point," "on
arrival," "at this time," or any relative-time phrase whatsoever. The timestamp is printed separately in
the margin. If a draft contains any time reference, rewrite it without one before returning.

Also: state ONLY what THIS event captured — never infer, never add a vital sign, action, or assessment
not present in the event; do not conclude, diagnose, or interpret. Do not repeat what the previous
sentences already say — if this event adds nothing new (a readback, duplicate, or restatement), return an
EMPTY sentence.

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
    maxTokens: 320,
  });

  if (!result.ok) return json({ error: result.error }, result.status ?? 502);
  return json({ sentence: typeof result.data.sentence === 'string' ? result.data.sentence : '' });
};
