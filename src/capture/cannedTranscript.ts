/**
 * SCRIPT 1 (fixtures/trauma_callout_script.md) as a timed transcript.
 *
 * Word-locked to the golden fixture (fixtures/expected_extraction.json). Bracketed
 * lexicon markers from the script are dropped — the spoken words already contain the
 * trigger phrases. Vitals are only at T+0:00 and T+0:50 ON PURPOSE: SCRIPT 1
 * preserves that gap so the vitals-freshness watch fires ~T+2:20 with zero edits.
 *
 * This is the zero-key fallback floor: no mic, no STT, no model.
 */

export interface CannedLine {
  atSec: number;
  text: string;
}

export const cannedTranscript: CannedLine[] = [
  { atSec: 0, text: 'Thirty-four-year-old male, unrestrained driver, high-speed MVC, ejected on scene. EMS report: GCS 13 on scene, heart rate 128, BP 88 over 54, respiratory rate 24.' },
  { atSec: 0, text: 'Trauma team, this is a trauma activation, level one, MVC unrestrained driver, ejected, ETA now. Recorder starting the clock.' },
  { atSec: 5, text: "Copy, I've got the airway. Primary survey starting. Airway is patent, he's talking to me." },
  { atSec: 20, text: 'IV access times two, left AC and right forearm, sixteen-gauge. Sending a type and cross for two units.' },
  { atSec: 35, text: 'Breath sounds equal bilaterally, no chest wall instability. Moving to circulation — pulses are thready, permissive hypotension, hold crystalloid wide open for now.' },
  { atSec: 50, text: 'Vitals at fifty seconds — heart rate one thirty-two, BP eighty-four over fifty, sat ninety-four on room air.' },
  { atSec: 65, text: "He's dropping his mental status. GCS is now nine. We're securing the airway — intubating now, RSI meds in." },
  { atSec: 80, text: 'Etomidate and rocuronium given, pushing now.' },
  { atSec: 95, text: 'Tube is in, confirmed by EtCO2 waveform and bilateral breath sounds. Airway secured.' },
  { atSec: 110, text: "Doing a FAST exam now — positive fluid in Morrison's pouch. He's got a belly bleed. Somebody get surgery to bedside, this one's going to the OR." },
  { atSec: 125, text: "Trauma surgery paged, they're on their way down." },
  { atSec: 140, text: 'Breath sounds decreased on the left, I feel crepitus. Going for a chest tube, left side, now.' },
  { atSec: 160, text: 'Chest tube placed, left fifth intercostal space, immediate return of two hundred mils dark blood. Reassess breath sounds — improved.' },
  { atSec: 175, text: 'Starting the massive transfusion — first unit of O-neg hanging now.' },
  { atSec: 190, text: 'Surgery team is at bedside.' },
  { atSec: 195, text: "Good, he's yours for the belly. I'm starting critical care time now, continuing to manage the airway and the chest tube en route." },
  { atSec: 210, text: 'Splinting the obvious right femur deformity before we move — extremity splint applied.' },
  { atSec: 225, text: 'Patient departing for the OR, trauma bay time total three minutes forty-five seconds.' },
];

/** total wall-clock of the canned case, in seconds (disposition at T+3:45). */
export const cannedDurationSec = 225;
