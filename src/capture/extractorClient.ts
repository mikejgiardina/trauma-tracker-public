/**
 * Extractor / Scribe client — the ONE live model call (prompts/10_extractor_scribe.md,
 * Sonnet 5, via netlify/functions/claude). Turns transcript into structured items.
 *
 * We send the full transcript-so-far and dedupe returned items by (t_rel|label|raw);
 * for a ~4-minute case this is cheap and avoids delta-boundary double-emits.
 */

import type { ExtractedItem, Utterance, ValueReading } from '../types.ts';

export const CLAUDE_ENDPOINT = '/.netlify/functions/claude';

interface ExtractResponse {
  items: ExtractedItem[];
}

export async function extract(utterances: Utterance[]): Promise<ExtractedItem[]> {
  const transcript = utterances.map((u) => `${u.t_rel} ${u.text}`).join('\n');
  const res = await fetch(CLAUDE_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ transcript }),
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
