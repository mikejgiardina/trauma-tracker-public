/**
 * Bundled extraction for the canned case (fixtures/expected_extraction.json).
 *
 * Lets canned mode run with NO Claude call — the hand-validated golden output stands
 * in for the live Extractor/Scribe. In live mode these come from netlify/functions/claude.
 */

import type { ExtractedItem, ValueReading } from '../types.ts';

export const cannedReadings: ValueReading[] = [
  { name: 'Age', value: 34, unit: 'years', heardAtSec: 0, raw: 'Thirty-four-year-old male' },
  { name: 'Sex', value: 'male', heardAtSec: 0, raw: 'Thirty-four-year-old male' },
  { name: 'GCS', value: 13, heardAtSec: 0, raw: 'GCS 13 on scene' },
  { name: 'HR', value: 128, unit: 'bpm', heardAtSec: 0, raw: 'heart rate 128' },
  { name: 'BP', value: '88/54', unit: 'mmHg', heardAtSec: 0, raw: 'BP 88 over 54' },
  { name: 'RR', value: 24, unit: '/min', heardAtSec: 0, raw: 'respiratory rate 24' },
  { name: 'HR', value: 132, unit: 'bpm', heardAtSec: 50, raw: 'heart rate one thirty-two' },
  { name: 'BP', value: '84/50', unit: 'mmHg', heardAtSec: 50, raw: 'BP eighty-four over fifty' },
  { name: 'SpO2', value: 94, unit: '% RA', heardAtSec: 50, raw: 'sat ninety-four on room air' },
  { name: 'GCS', value: 9, heardAtSec: 65, raw: 'GCS is now nine' },
  { name: 'chest_tube_output', value: 200, unit: 'mL dark blood', heardAtSec: 160, raw: 'two hundred mils dark blood' },
];

export const cannedItems: ExtractedItem[] = [
  ...cannedReadings.map<ExtractedItem>((r) => ({
    type: 'value', t_rel: secTRel(r.heardAtSec), label: r.name, name: r.name, value: r.value, unit: r.unit ?? null, raw: r.raw ?? '',
  })),
  ev(0, 'Trauma activation — level 1, MVC unrestrained driver, ejected', 'trauma activation, level one'),
  ev(20, 'IV access ×2, 16-gauge (L AC, R forearm)', 'IV access times two ... sixteen-gauge'),
  ev(20, 'Type & cross, 2 units', 'type and cross for two units'),
  ev(95, 'Intubation — confirmed EtCO2 waveform + bilateral breath sounds', 'Tube is in, confirmed by EtCO2 waveform and bilateral breath sounds'),
  ev(110, "FAST exam — positive fluid, Morrison's pouch", "positive fluid in Morrison's pouch"),
  ev(160, 'Chest tube — L 5th ICS, 200 mL return, BS improved', 'Chest tube placed, left fifth intercostal space'),
  ev(175, 'Massive transfusion — first unit O-neg', 'Starting the massive transfusion'),
  ev(190, 'Trauma surgeon at bedside', 'Surgery team is at bedside'),
  ev(195, 'Critical care time started', 'starting critical care time now'),
  ev(210, 'Extremity splint — right femur', 'right femur deformity ... extremity splint applied'),
  ev(225, 'Disposition — departing for OR', 'Patient departing for the OR'),
];

function ev(atSec: number, label: string, raw: string): ExtractedItem {
  return { type: 'event', t_rel: secTRel(atSec), label, raw };
}

function secTRel(sec: number): string {
  const mm = Math.floor(sec / 60);
  const ss = sec % 60;
  return `T+${mm}:${String(ss).padStart(2, '0')}`;
}
