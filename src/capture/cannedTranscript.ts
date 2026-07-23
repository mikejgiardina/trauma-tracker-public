/**
 * Canned case transcript — time-locked to public/demo-audio.mp3.
 *
 * Derived from a real Deepgram pass over the demo recording (so every line's atSec is
 * WHEN it is actually spoken in the audio), then hand-corrected for the handful of STT
 * mis-hears — "128"→"28", respirations→"Respers", diaphoretic→"diuretic",
 * cap refill→"Hep refills", crepitus→"preppetous", O-neg→"bone, neck". Nothing unspoken
 * was added: the words here are the words on the tape. That faithfulness is the point —
 * canned reveals each line as the audio reaches it and feeds the LIVE extractor, so the
 * panels track what you hear instead of dumping at t=0.
 *
 * No pre-baked extraction anymore (cannedExtraction is gone). Canned needs ANTHROPIC_API_KEY
 * like live/file — the extractor is the real one.
 */

import type { Utterance } from '../types.ts';

export interface CannedLine {
  atSec: number;
  text: string;
}

export const cannedTranscript: CannedLine[] = [
  { atSec: 0, text: 'Recorder starting the clock. Thirty-four-year-old male.' },
  { atSec: 5, text: 'He went about twenty feet. GCS 13 on scene.' },
  { atSec: 9, text: 'Heart rate 128.' },
  { atSec: 11, text: 'BP is 88 over 54.' },
  { atSec: 17, text: 'Respirations are 24.' },
  { atSec: 21, text: 'Obvious open right thigh deformity.' },
  { atSec: 26, text: 'Scalp laceration.' },
  { atSec: 57, text: 'Both lines are in, sixteen and sixteen gauge. Breath sounds equal bilaterally.' },
  { atSec: 61, text: 'No chest wall instability.' },
  { atSec: 63, text: 'Moving on to circulation.' },
  { atSec: 66, text: 'Pulses are thready.' },
  { atSec: 69, text: "Skin's cool and diaphoretic." },
  { atSec: 72, text: 'Cap refill is kind of delayed.' },
  { atSec: 74, text: "Permissive hypotension though. Let's hold crystalloid." },
  { atSec: 79, text: 'Get off me!' },
  { atSec: 82, text: "Vitals at fifty seconds — heart rate 132, BP 84 over 50, sat 94 on room air. He's dropping his mental status. GCS is now nine." },
  { atSec: 92, text: 'Eyes to pain, moaning, localizes.' },
  { atSec: 98, text: 'We need to secure the airway. Intubating now, RSI meds in.' },
  { atSec: 104, text: 'Etomidate and rocuronium given, pushing now. Tube is in.' },
  { atSec: 108, text: 'Confirmed by end-tidal CO2 waveform, bilateral breath sounds, sustained waveform, equal chest expansion. Airway secure.' },
  { atSec: 119, text: 'Doing a FAST exam now.' },
  { atSec: 124, text: "Positive fluid in the Morrison's pouch, free fluid in the right upper quadrant." },
  { atSec: 129, text: "He's got a belly bleed. Someone page surgery to bedside — this one's probably going to the OR. Trauma surgery paged, they're on their way down." },
  { atSec: 138, text: 'Breath sounds decreased on the left. I feel crepitus now.' },
  { atSec: 142, text: "He's getting harder to bag. I think it's time for a chest tube, left side, now." },
  { atSec: 150, text: 'Chest tube placed, left fifth intercostal space. Immediate return of two hundred mils of dark blood.' },
  { atSec: 157, text: 'Reassess breath sounds.' },
  { atSec: 160, text: 'Massive transfusion — first unit of O-negative hanging now.' },
  { atSec: 166, text: 'Surgery team at bedside.' },
  { atSec: 169, text: "He's yours for the belly." },
  { atSec: 172, text: "I'm starting critical care time now, continuing to manage the airway and chest tube en route." },
  { atSec: 180, text: 'Splinting the obvious right femur deformity before we move.' },
  { atSec: 185, text: 'Extremity splint applied.' },
  { atSec: 188, text: 'Patient departing for the OR. Trauma bay total time, three minutes forty-five seconds.' },
];

function tRel(atSec: number): string {
  const mm = Math.floor(atSec / 60);
  const ss = atSec % 60;
  return `T+${mm}:${String(ss).padStart(2, '0')}`;
}

/** The transcript as engine Utterances — the reveal source for canned mode. */
export const cannedUtterances: Utterance[] = cannedTranscript.map((l) => ({
  t_rel: tRel(l.atSec),
  atSec: l.atSec,
  text: l.text,
}));

/** Wall-clock length of the canned case — a few seconds past the last spoken line so the
 *  final extractor pass completes before we stop. (Audio file itself runs ~248s with a
 *  silent tail; the case wraps at the disposition line.) */
export const cannedDurationSec = 194;
