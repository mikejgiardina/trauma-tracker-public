// src/report/reportAgents.ts
// Post-report agents other than the nurse's note (that's built incrementally by
// useNarrative during the resus). Hot debrief + exposure run once at report time on the
// COMPACT event list and are told to be selective — only what's genuinely debrief- or
// exposure-worthy. Small in, small out — fast and reliably under the function timeout.
// Best-effort: a failed call leaves its section "Unavailable"; the report never breaks.

import type { ExtractedItem, Gap, Utterance, ValueReading } from '../types.ts';

const FN = '/.netlify/functions';

export interface HotDebriefResult {
  hot_debrief?: {
    summary?: string;
    went_well?: { what: string; evidence_t_rel?: string }[];
    challenges?: { what: string; evidence_t_rel?: string; framing?: string }[];
    action_points?: { point: string; owner_role?: string }[];
  };
}

export interface ExposureResult {
  _disclaimer?: string;
  incident?: { incident_load?: string; impact_likelihood?: string; band_rationale?: string };
  leadership?: { aggregate_observations?: string[] };
}

export interface ReportAgents {
  hotDebrief: HotDebriefResult | null;
  exposure: ExposureResult | null;
  errors: string[];
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${FN}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = (await r.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!r.ok || !j || j.error) throw new Error(j?.error ?? `${path} ${r.status}`);
  return j;
}

export async function runReportAgents(
  items: ExtractedItem[],
  _readings: ValueReading[],
  _utterances: Utterance[],
  _gaps: Gap[],
): Promise<ReportAgents> {
  const events = items
    .filter((i) => i.type === 'event' && i.label)
    .map((e) => ({ t_rel: e.t_rel, label: e.label }));
  const caseId = 'SYN-0007';
  const errors: string[] = [];

  const [hotDebrief, exposure] = await Promise.all([
    post<HotDebriefResult>('debrief', { agent: 'hot_debrief', input: { case_id: caseId, events } }).catch((e) => {
      errors.push(`debrief: ${(e as Error).message}`);
      return null;
    }),
    post<ExposureResult>('debrief', { agent: 'exposure_badge', input: { case_id: caseId, events } }).catch((e) => {
      errors.push(`exposure review: ${(e as Error).message}`);
      return null;
    }),
  ]);

  return { hotDebrief, exposure, errors };
}
