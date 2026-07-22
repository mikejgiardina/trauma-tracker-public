// src/report/reportAgents.ts
// Runs the post-report LLM agents that the deterministic engine can't produce:
//   nurse's note (Agent 2, /note), hot debrief (Agent 3, /debrief), and the
//   emotional-impact / exposure review (Agent 4, /debrief exposure_badge).
// Each is best-effort: if a call fails (no key/credit), that section is simply
// omitted — the deterministic report still stands.

import type { Gap, ExtractedItem, Utterance, ValueReading } from '../types.ts';

const FN = '/.netlify/functions';

function parseSec(t: string): number {
  const m = /T\+(\d+):(\d+)/.exec(t);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : 0;
}

// ── Agent output shapes (only the fields the report renders) ──────────────────
export interface NoteResult {
  page1Narrative: { t: number; text: string; sourceEventIds: string[] }[];
  page1NotCaptured: { what: string; note: string }[];
  attestation?: string;
  _disclaimer?: string;
}

export interface HotDebriefResult {
  hot_debrief?: {
    summary?: string;
    went_well?: { what: string; evidence_t_rel?: string }[];
    challenges?: { what: string; evidence_t_rel?: string; framing?: string }[];
    system_issues?: { what: string; evidence_t_rel?: string }[];
    action_points?: { point: string; owner_role?: string }[];
    ems_handoff?: { mode?: string; report_received?: string; worth_examining?: string[] };
  };
}

export interface ExposureResult {
  _disclaimer?: string;
  incident?: {
    incident_load?: string;
    impact_likelihood?: string;
    band_rationale?: string;
    exposure_factors?: { factor: string; category?: string; t_rel?: string }[];
  };
  critical_incident?: { flagged?: boolean; categories?: string[]; rationale?: string };
  crew?: { staff_id?: string; role?: string; this_incident?: string; badge_state?: string }[];
  leadership?: { aggregate_observations?: string[]; questions_worth_asking?: string[]; resources_that_exist?: string[] };
}

export interface ReportAgents {
  note: NoteResult | null;
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
  readings: ValueReading[],
  utterances: Utterance[],
  gaps: Gap[],
): Promise<ReportAgents> {
  const events = items
    .filter((i) => i.type === 'event' && i.label)
    .map((e, i) => ({ id: `evt-${i}`, t: parseSec(e.t_rel), label: e.label, text: e.raw || e.label }));
  const values = readings.map((r) => ({
    name: r.name,
    value: r.value,
    unit: r.unit ?? undefined,
    t: r.heardAtSec,
    raw: r.raw,
  }));
  const notCaptured = gaps.map((g) => ({ what: g.label, note: g.text }));
  const transcript = utterances.map((u) => `${u.t_rel} ${u.text}`).join('\n');
  const caseId = 'SYN-0007';

  const errors: string[] = [];
  const [note, hotDebrief, exposure] = await Promise.all([
    post<NoteResult>('note', { events, values, notCaptured, caseId }).catch((e) => {
      errors.push(`nurse's note: ${(e as Error).message}`);
      return null;
    }),
    post<HotDebriefResult>('debrief', { agent: 'hot_debrief', input: { case_id: caseId, transcript, events } }).catch((e) => {
      errors.push(`debrief: ${(e as Error).message}`);
      return null;
    }),
    post<ExposureResult>('debrief', { agent: 'exposure_badge', input: { case_id: caseId, transcript, events } }).catch((e) => {
      errors.push(`exposure review: ${(e as Error).message}`);
      return null;
    }),
  ]);

  return { note, hotDebrief, exposure, errors };
}
