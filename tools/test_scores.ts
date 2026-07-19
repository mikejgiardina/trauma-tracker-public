/**
 * Score table-test. Run: `npm run test:scores`.
 *
 * Locks the four hand-computed values from fixtures/expected_extraction.json against
 * the pure functions in src/engine/scores.ts. No framework, no JSON import — the
 * numbers are the contract.
 */

import assert from 'node:assert/strict';
import { shockIndex, rts } from '../src/engine/scores.ts';

const cases: { label: string; got: number; want: number }[] = [
  { label: 'shockIndex(128, 88)', got: shockIndex(128, 88), want: 1.45 },
  { label: 'shockIndex(132, 84)', got: shockIndex(132, 84), want: 1.57 },
  { label: 'rts(13, 88, 24)', got: rts(13, 88, 24), want: 7.11 },
  { label: 'rts(9, 84, 24)', got: rts(9, 84, 24), want: 6.17 },
];

let failed = 0;
for (const c of cases) {
  try {
    assert.equal(c.got, c.want);
    console.log(`  ok   ${c.label} = ${c.got}`);
  } catch {
    failed++;
    console.error(`  FAIL ${c.label} = ${c.got}, expected ${c.want}`);
  }
}

if (failed) {
  console.error(`\n${failed} score check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${cases.length} score checks passed.`);
