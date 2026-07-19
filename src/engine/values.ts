/**
 * The value stream: latest reading per name + the parsed scalars the predicates read.
 *
 * Score inputs (HR/SBP/GCS/RR) come from stated `value` items. The derived scalars
 * (iv_sites, iv_gauge, prbc_units, splint_site, laceration_cm) are parsed from the
 * transcript — several obligation atoms carry BOTH an affirm list and a predicate, so
 * these are belt-and-suspenders plus feed the record/report.
 */

import type { ValueReading, ValuesState } from '../types.ts';
import type { Corpus } from './matcher.ts';
import { contains } from './matcher.ts';

function num(v: number | string): number | null {
  if (typeof v === 'number') return v;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/** systolic from "88/54". */
function parseSBP(v: number | string): number | null {
  if (typeof v === 'number') return v;
  const m = /(\d+)\s*\/\s*(\d+)/.exec(v);
  return m ? parseInt(m[1], 10) : num(v);
}
function parseDBP(v: number | string): number | null {
  if (typeof v === 'string') {
    const m = /(\d+)\s*\/\s*(\d+)/.exec(v);
    if (m) return parseInt(m[2], 10);
  }
  return null;
}

const SPLINT_SITES = [
  'thigh', 'femur', 'leg', 'knee', 'tibia', 'ankle', 'shoulder', 'humerus',
  'arm', 'elbow', 'forearm', 'wrist', 'lower leg', 'calf', 'foot',
];

export function buildValues(readings: ValueReading[], corpus: Corpus, nowSec: number): ValuesState {
  const heard = readings.filter((r) => r.heardAtSec <= nowSec).sort((a, b) => a.heardAtSec - b.heardAtSec);
  const latest: Record<string, ValueReading> = {};
  for (const r of heard) latest[r.name] = r;

  const gcsHistory = heard
    .filter((r) => r.name === 'GCS')
    .map((r) => ({ atSec: r.heardAtSec, value: num(r.value) ?? NaN }))
    .filter((p) => Number.isFinite(p.value));

  const bp = latest['BP'];
  const hr = latest['HR'];
  const rr = latest['RR'];
  const spo2 = latest['SpO2'];
  const gcs = latest['GCS'];
  const age = latest['Age'];
  const sex = latest['Sex'];
  const weight = latest['Weight'];

  // derived scalars parsed from the transcript
  const iv_sites =
    contains2(corpus, ['times two', 'x2', 'two lines', 'both lines', 'two large bore', 'two large-bore', 'two peripheral'])
      ? 2
      : null;
  const iv_gauge = contains2(corpus, ['sixteen gauge', 'sixteen-gauge', '16 gauge'])
    ? 16
    : contains2(corpus, ['fourteen gauge', 'fourteen-gauge', '14 gauge'])
      ? 14
      : contains2(corpus, ['large bore', 'large-bore'])
        ? 16
        : null;
  const prbc_units = contains2(corpus, ['two units', '2 units']) ? 2 : null;
  const splint_site = corpus.lines.some((l) => l.norm.includes('splint'))
    ? SPLINT_SITES.find((s) => contains2(corpus, [s])) ?? null
    : null;
  const laceration_cm = parseCm(corpus);

  return {
    latest,
    SBP: bp ? parseSBP(bp.value) : null,
    DBP: bp ? parseDBP(bp.value) : null,
    HR: hr ? num(hr.value) : null,
    RR: rr ? num(rr.value) : null,
    SpO2: spo2 ? num(spo2.value) : null,
    GCS: gcs ? num(gcs.value) : null,
    gcsHistory,
    Age: age ? num(age.value) : null,
    Sex: sex ? String(sex.value) : null,
    Weight: weight ? num(weight.value) : null,
    iv_sites,
    iv_gauge,
    prbc_units,
    splint_site,
    laceration_cm,
  };
}

function contains2(corpus: Corpus, phrases: string[]): boolean {
  return corpus.lines.some((l) => phrases.some((p) => contains(l.norm, p)));
}

function parseCm(corpus: Corpus): number | null {
  for (const l of corpus.lines) {
    const m = /(\d+(?:\.\d+)?)\s*(?:cm|centimeter)/.exec(l.norm);
    if (m) return parseFloat(m[1]);
  }
  return null;
}

/** greatest single acute drop in GCS across the history (for "delta_negative"). */
export function gcsMaxDrop(values: ValuesState): number {
  const h = values.gcsHistory;
  let maxDrop = 0;
  for (let i = 0; i < h.length; i++) {
    for (let j = i + 1; j < h.length; j++) {
      maxDrop = Math.max(maxDrop, h[i].value - h[j].value);
    }
  }
  return maxDrop;
}
