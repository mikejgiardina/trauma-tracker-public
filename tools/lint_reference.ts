/**
 * Reference-data CI (buildable task #14). Run: `npm run lint:reference`
 * (node --experimental-strip-types). Fast, deterministic, no model / no audio.
 *
 * Checks:
 *   0. JSON validity + basic shape of the rulebook.
 *   1. STATIC (corpus assertion 3): no trigger phrase is a token-substring of another
 *      (the COL-001 "tube is in" / "tubes are in" class), across obligations + lattice.
 *   2. COVERAGE (assertion 2): every charge obligation is exercised by >=1 must_fire AND
 *      >=1 must_not_fire row in the collision corpus (warn — corpus is a live proposal).
 *   3. BEHAVIORAL (assertion 1, subset): run the REAL matcher guards over the collision
 *      rows we can adjudicate deterministically (future-tense, preceding-negation, the
 *      EtCO2/site positive controls) and assert fire/silence.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildCorpus, firstMatch, contains } from '../src/engine/matcher.ts';

const here = dirname(fileURLToPath(import.meta.url));
const data = (p: string) => join(here, '..', 'src', 'data', p);
const readJSON = (p: string) => JSON.parse(readFileSync(data(p), 'utf8'));

const obligations = readJSON('obligations.json');
const lattice = readJSON('activation_lattice.json');
const charges = readJSON('charges.json');
const scores = readJSON('trauma_scores.json');
const corpusRows = readFileSync(data('collision_corpus.jsonl'), 'utf8')
  .split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
  .filter((r) => r.id);

let fail = 0;
let warn = 0;
const bad = (m: string) => { console.log('✗ ' + m); fail++; };
const soft = (m: string) => { console.log('⚠ ' + m); warn++; };
const ok = (m: string) => console.log('✓ ' + m);

// ── 0. shape ──
if (!Array.isArray(obligations.obligations)) bad('obligations.obligations is not an array');
if (!Array.isArray(lattice.families)) bad('lattice.families is not an array');
if (!Array.isArray(charges.charge_items)) bad('charges.charge_items is not an array');
if (!scores.scores?.RTS) bad('trauma_scores missing RTS');
ok(`loaded ${obligations.obligations.length} obligations, ${lattice.families.length} lattice families, ${charges.charge_items.length} charge items, ${corpusRows.length} collision rows`);

// ── 1. STATIC substring check ──
type Trig = { phrase: string; owner: string };
const triggers: Trig[] = [];
for (const o of obligations.obligations) for (const p of o.trigger?.any_of ?? []) triggers.push({ phrase: p, owner: o.id });
for (const f of lattice.families) for (const p of f.enter_when?.any_of ?? []) triggers.push({ phrase: p, owner: f.id });

let collisions = 0;
for (const a of triggers) {
  for (const b of triggers) {
    if (a === b || a.owner === b.owner) continue;
    // is a a whole-token substring of b? (b's phrase contains a's phrase)
    if (a.phrase !== b.phrase && contains(b.phrase, a.phrase)) {
      soft(`trigger "${a.phrase}" (${a.owner}) is contained in "${b.phrase}" (${b.owner}) — needs longest-match-wins + a corpus row`);
      collisions++;
    }
  }
}
if (collisions === 0) ok('STATIC: no cross-owner trigger substring collisions');

// ── 2. coverage ──
const chargeCodes = new Set(obligations.obligations.filter((o: { subject?: { kind?: string } }) => o.subject?.kind === 'charge').map((o: { subject: { ref?: string } }) => o.subject.ref));
for (const code of chargeCodes) {
  const fires = corpusRows.some((r) => (r.must_fire ?? []).some((t: string) => t.startsWith(String(code))));
  const silents = corpusRows.some((r) => (r.must_not_fire ?? []).some((t: string) => t.startsWith(String(code))));
  if (!fires) soft(`coverage: charge ${code} has no must_fire row`);
  if (!silents) soft(`coverage: charge ${code} has no must_not_fire near-miss row`);
}
ok('COVERAGE: checked collision-corpus coverage for charge obligations');

// ── 3. behavioral subset (the real matcher guards) ──
function fires(utterance: string, phrases: string[], guard?: object): boolean {
  const corp = buildCorpus([{ t_rel: 'T+0:00', atSec: 0, text: utterance }], 0);
  return firstMatch(corp, phrases, guard as never) !== null;
}
const CHT = ['chest tube', 'tube thoracostomy', 'decompressing the left', 'decompressing the right'];
const FALL = ['fall', 'fell', 'jumped from', 'fell from'];
// EtCO2 is the highest-stakes STT token in the build — source its variant list from the
// SHIPPED obligation data instead of a hand-copied literal, so this test can never drift
// from what the app actually matches. (COL-021 regression: the literal here fell behind
// obligations.json, which already carries 'et co two' / 'co two waveform'.)
const etco2Atom = (obligations.obligations as Array<{
  id: string;
  requires?: { all_of?: Array<{ id?: string; affirm?: string[] }> };
}>)
  .find((o) => o.id === 'OBL-AWY-ETI-CONFIRM')
  ?.requires?.all_of?.find((a) => a.id === 'etco2');
const ETCO2 = etco2Atom?.affirm ?? [];
if (!ETCO2.length) bad('lexicon: OBL-AWY-ETI-CONFIRM etco2 affirm list not found — test cannot self-source');

const behavioral: [string, boolean, boolean][] = [
  // [description, actual, expected]
  ['COL-004 future-tense chest tube stays silent',
    fires("he's going to need a chest tube", CHT, { not_future_tense: true }), false],
  ['COL-005 real chest-tube placement fires',
    fires('Decompressing the left now. Chest tube is going in, tube is in.', CHT, { not_future_tense: true }), true],
  ['COL-011 MECH_FALL not entered after "that\'s not a fall"',
    fires("high-speed MVC, that's not a fall", FALL, { not_negated: true }), false],
  ['COL-021 EtCO2 variant "ET CO two" fires',
    fires('ET CO two waveform present and sustained', ETCO2), true],
  ['COL-022 EtCO2 variant "end-tidal CO2" fires',
    fires('end-tidal CO2 waveform present and sustained', ETCO2), true],
  ['COL-025 splint site "right thigh" present',
    fires('Right thigh, open femur deformity. Extremity splint applied.', ['thigh']), true],
];
for (const [desc, actual, expected] of behavioral) {
  if (actual === expected) ok('BEHAVIORAL: ' + desc);
  else bad(`BEHAVIORAL: ${desc} (got ${actual}, expected ${expected})`);
}

console.log(`\n${fail} failure(s), ${warn} warning(s).`);
if (fail) process.exit(1);
