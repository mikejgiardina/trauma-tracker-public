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

/**
 * The engine reads a FIXED value vocabulary (engine/values.ts): BP, HR, RR, SpO2, GCS,
 * Age, Sex, Weight. A live model names things however the room said them — "Heart rate",
 * "Respiratory rate", "O2 sat" — so names are normalized here. The engine contract is
 * authoritative; the model's phrasing is not. Anything unrecognized passes through
 * untouched (it still shows in Values Heard, it just isn't a score input).
 */
const NAME_ALIASES: Record<string, string> = {
  'hr': 'HR', 'heart rate': 'HR', 'heartrate': 'HR', 'pulse': 'HR', 'pulse rate': 'HR',
  'rr': 'RR', 'respiratory rate': 'RR', 'respiration rate': 'RR', 'resp rate': 'RR',
  'respirations': 'RR', 'resps': 'RR', 'breaths per minute': 'RR',
  'spo2': 'SpO2', 'sao2': 'SpO2', 'o2 sat': 'SpO2', 'o2 saturation': 'SpO2',
  'oxygen saturation': 'SpO2', 'sat': 'SpO2', 'sats': 'SpO2', 'pulse ox': 'SpO2',
  'bp': 'BP', 'blood pressure': 'BP', 'nibp': 'BP',
  'sbp': 'SBP', 'systolic': 'SBP', 'systolic bp': 'SBP', 'systolic blood pressure': 'SBP',
  'dbp': 'DBP', 'diastolic': 'DBP', 'diastolic bp': 'DBP', 'diastolic blood pressure': 'DBP',
  'gcs': 'GCS', 'gcs total': 'GCS', 'glasgow coma scale': 'GCS',
  'age': 'Age', 'sex': 'Sex', 'gender': 'Sex', 'weight': 'Weight',
};

function canonicalName(raw: string): string {
  const k = raw.trim().toLowerCase();
  return NAME_ALIASES[k] ?? raw.trim();
}

/** derive the value stream from extracted `value` items. */
export function readingsFromItems(items: ExtractedItem[]): ValueReading[] {
  const raw = items
    .filter((i) => i.type === 'value' && i.name && i.value != null)
    .map<ValueReading>((i) => ({
      name: canonicalName(i.name as string),
      value: i.value as number | string,
      unit: i.unit ?? null,
      heardAtSec: parseSec(i.t_rel),
      raw: i.raw,
    }));

  // The extractor reports systolic and diastolic separately; the engine wants ONE "BP"
  // reading ("84/50") and does its own split (values.ts parseSBP/parseDBP). Fold the pair
  // back together on the timestamp they were heard at, so the SBP tile and Shock Index
  // actually populate.
  const dbp = raw.filter((r) => r.name === 'DBP');
  const nearestDbp = (atSec: number): ValueReading | undefined =>
    dbp.find((d) => Math.abs(d.heardAtSec - atSec) <= 3);

  // "88 over 54" / "88/54" as spoken — the pair survives in the raw utterance even when the
  // model only bothers to emit the systolic, so recover it rather than trusting compliance.
  const PAIR = /(\d{2,3})\s*(?:\/|over)\s*(\d{2,3})/i;

  const out: ValueReading[] = [];
  for (const r of raw) {
    if (r.name === 'DBP') continue; // folded into BP below
    if (r.name === 'SBP' || r.name === 'BP') {
      const d = nearestDbp(r.heardAtSec);
      const spoken = typeof r.value === 'string' ? PAIR.exec(r.value) : null;
      const fromRaw = r.raw ? PAIR.exec(r.raw) : null;
      const value = d ? `${r.value}/${d.value}`
        : spoken ? `${spoken[1]}/${spoken[2]}`
        : fromRaw ? `${fromRaw[1]}/${fromRaw[2]}`
        : r.value;
      out.push({ ...r, name: 'BP', unit: 'mmHg', value });
      continue;
    }
    out.push(r);
  }
  return out;
}
