/**
 * Extractor / Scribe client — the ONE live model call (prompts/10_extractor_scribe.md,
 * Sonnet 5, via netlify/functions/claude). Turns transcript into structured items.
 *
 * Fix 1 (compute fat): send only the NEW window since the last extract plus the
 * compact list of items already captured; the model emits ONLY new items, so tokens
 * stay bounded across a run. dedupeItems (below) remains the safety net.
 */

import type { ExtractedItem, Utterance, ValueReading } from '../types.ts';

export const CLAUDE_ENDPOINT = '/.netlify/functions/claude';

interface ExtractResponse {
  items: ExtractedItem[];
}

interface PriorItem {
  kind: ExtractedItem['type'];
  t_rel: string;
  text: string;
}

export async function extract(
  windowUtterances: Utterance[],
  priorItems: ExtractedItem[] = [],
): Promise<ExtractedItem[]> {
  const windowText = windowUtterances.map((u) => `${u.t_rel} ${u.text}`).join('\n');
  const prior: PriorItem[] = priorItems.map((i) => ({ kind: i.type, t_rel: i.t_rel, text: i.label }));
  const res = await fetch(CLAUDE_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ windowText, priorItems: prior }),
  });
  if (!res.ok) throw new Error(`Extractor ${res.status}: ${await res.text().catch(() => '')}`);
  const json = (await res.json()) as ExtractResponse;
  return json.items ?? [];
}

export function dedupeItems(items: ExtractedItem[]): ExtractedItem[] {
  const seen = new Set<string>();
  const out: ExtractedItem[] = [];
  for (const it of items) {
    const key = `${it.t_rel}|${it.type}|${it.label}|${it.raw}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

function parseSec(t: string): number {
  // "T+MM:SS" or "T+H:MM:SS"
  const three = /T\+(\d+):(\d+):(\d+)/.exec(t);
  if (three) return +three[1] * 3600 + +three[2] * 60 + +three[3];
  const two = /T\+(\d+):(\d+)/.exec(t);
  if (two) return +two[1] * 60 + +two[2];
  return 0;
}

/** derive the value stream from extracted `value` items. */
export function readingsFromItems(items: ExtractedItem[]): ValueReading[] {
  return items
    .filter((i) => i.type === 'value' && i.name && i.value != null)
    .map<ValueReading>((i) => ({
      name: i.name as string,
      value: i.value as number | string,
      unit: i.unit ?? null,
      heardAtSec: parseSec(i.t_rel),
      raw: i.raw,
    }));
}
