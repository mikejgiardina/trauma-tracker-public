/**
 * The ONE live model call — Extractor / Scribe (prompts/10_extractor_scribe.md).
 *
 * Holds the Anthropic key server-side; the browser never sees it. Turns a transcript
 * window into structured items. Called via /.netlify/functions/claude from the client
 * (and mounted in dev by the vite plugin in vite.config.ts). No SDK — direct REST.
 */

const EXTRACTOR_SYSTEM = `You extract discrete clinical events, spoken values, and interventions from a live trauma-bay audio transcript. Multiple people are speaking; you do NOT identify who — you catalogue WHAT was said. Synthetic data only; never infer facts not present in the transcript.

For each new transcript segment, emit events. Use ONLY what is stated. Mark anything ambiguous as "uncertain": true rather than guessing. Timestamps are relative to activation (T+MM:SS) as spoken by the recorder; if a segment has no explicit time, attach it to the most recent stated time.

Emit three kinds of items:
1. event — an intervention/assessment/decision (intubation, FAST, chest tube, activation).
2. value — a discrete measurement or stated demographic (vital, lab, score, Age, Sex, Weight). Populate name, value, unit.
3. note — clinically relevant context that isn't an event or value.

Do not compute scores. Do not assign charges. Faithful capture only.

Output ONLY JSON of the form:
{"items":[{"type":"event|value|note","t_rel":"T+MM:SS","label":"string","name":"string|null","value":"string|number|null","unit":"string|null","raw":"verbatim phrase","uncertain":false}]}

Guardrails:
- Never emit a value the transcript didn't state (no normal-range hallucination).
- Preserve the verbatim raw phrase.
- Never infer Age, Sex, or Weight from a voice, a name, or pronouns. Emit them only when stated outright.
- If nothing extractable, return {"items":[]}.`;

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
}

/** pull the first JSON object out of a possibly fenced model reply. */
function parseItems(text: string): unknown[] {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < 0) return [];
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as { items?: unknown[] };
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return json({ error: 'ANTHROPIC_API_KEY not set on the server' }, 500);

  let transcript = '';
  try {
    ({ transcript = '' } = (await req.json()) as { transcript?: string });
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }
  if (!transcript.trim()) return json({ items: [] });

  const model = process.env.ANTHROPIC_MODEL_EXTRACTOR || 'claude-sonnet-5';
  const body = {
    model,
    max_tokens: 2000,
    system: EXTRACTOR_SYSTEM,
    messages: [{ role: 'user', content: `Transcript so far:\n${transcript}\n\nReturn the items JSON for everything extractable, JSON only.` }],
  };

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) return json({ error: `anthropic ${r.status}`, detail: await r.text().catch(() => '') }, 502);

  const data = (await r.json()) as { content?: { type: string; text?: string }[] };
  const text = data.content?.map((c) => c.text ?? '').join('') ?? '{"items":[]}';
  return json({ items: parseItems(text) });
};
