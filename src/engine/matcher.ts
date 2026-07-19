/**
 * Deterministic lexicon matcher — the substrate under the ledger and the walker.
 *
 * Everything here is pure string work over the transcript-so-far. It implements the
 * trigger guards the collision corpus tests: not_future_tense, not_negated, not_deferred,
 * and the lattice enter_guard.not_preceded_by_negation.
 *
 * Design notes:
 *  - Matching is whole-token (padded-space contains), after normalization folds hyphens
 *    and apostrophes so "sixteen-gauge" == "sixteen gauge" and "Morrison's" == "morrisons".
 *  - Negation/future/deferral are only consulted for TRIGGERS and lattice ENTRY. `affirm`
 *    atoms match plainly, on purpose: "no free fluid" / "negative FAST" are valid
 *    interpretation affirmations, not negations of the trigger.
 */

import type { TriggerGuard, Utterance } from '../types.ts';

export interface CorpusLine {
  atSec: number;
  norm: string;
  raw: string;
}
export interface Corpus {
  lines: CorpusLine[];
}

const NEG_MARKERS = [
  'no', 'not', 'never', 'without', 'denies', 'deny', 'negative', 'none',
  'dont', 'didnt', 'isnt', 'wasnt', 'cant', 'couldnt', 'wont', 'neither',
  'nor', 'unable', 'ruled',
];
const FUTURE_MARKERS = [
  'going', 'gonna', 'will', 'well', 'hell', 'shell', 'theyll', 'need', 'needs',
  'get', 'order', 'ordered', 'lets', 'prep', 'plan',
];
const DONE_MARKERS = ['done', 'in', 'placed', 'complete', 'completed', 'confirmed', 'is'];
const DEFER_MARKERS_PHRASES = ['hold that', 'hold off', 'hold on', 'for now', 'not yet', 'defer', 'later'];

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildCorpus(utterances: Utterance[], nowSec: number): Corpus {
  const lines = utterances
    .filter((u) => u.atSec <= nowSec)
    .sort((a, b) => a.atSec - b.atSec)
    .map((u) => ({ atSec: u.atSec, norm: normalize(u.text), raw: u.text }));
  return { lines };
}

/** whole-token containment: is `phrase` present as a token-run in `norm`? */
export function contains(norm: string, phrase: string): boolean {
  const p = normalize(phrase);
  if (!p) return false;
  return ` ${norm} `.includes(` ${p} `);
}

function tokens(s: string): string[] {
  return s.length ? s.split(' ') : [];
}

/** index of the first token of `phrase` within `norm`'s token list, or -1. */
function phraseTokenStart(norm: string, phrase: string): number {
  const nt = tokens(norm);
  const pt = tokens(normalize(phrase));
  if (!pt.length) return -1;
  for (let i = 0; i + pt.length <= nt.length; i++) {
    let ok = true;
    for (let j = 0; j < pt.length; j++) {
      if (nt[i + j] !== pt[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return -1;
}

/** a negation marker within `window` tokens on either side of the phrase occurrence. */
export function negatedNear(norm: string, phrase: string, window = 4): boolean {
  const nt = tokens(norm);
  const start = phraseTokenStart(norm, phrase);
  if (start < 0) return false;
  const pt = tokens(normalize(phrase));
  const end = start + pt.length - 1;
  const lo = Math.max(0, start - window);
  const hi = Math.min(nt.length - 1, end + window);
  for (let i = lo; i <= hi; i++) {
    if (i >= start && i <= end) continue;
    if (NEG_MARKERS.includes(nt[i])) return true;
  }
  return false;
}

/** future/order framing with no completion marker → the thing hasn't happened yet. */
export function futureFramed(norm: string): boolean {
  const nt = tokens(norm);
  const hasFuture = nt.some((t) => FUTURE_MARKERS.includes(t));
  const hasDone = nt.some((t) => DONE_MARKERS.includes(t));
  return hasFuture && !hasDone;
}

export function deferred(norm: string): boolean {
  return DEFER_MARKERS_PHRASES.some((p) => norm.includes(p));
}

export interface MatchHit {
  atSec: number;
  raw: string;
  phrase: string;
}

/**
 * Earliest occurrence of any of `phrases`, subject to trigger guards.
 * `affirm`-style matching passes no guard and gets plain presence.
 */
export function firstMatch(
  corpus: Corpus,
  phrases: string[] | undefined,
  guard?: TriggerGuard,
): MatchHit | null {
  if (!phrases || !phrases.length) return null;
  for (const line of corpus.lines) {
    for (const phrase of phrases) {
      if (!contains(line.norm, phrase)) continue;
      if (guard?.not_negated && negatedNear(line.norm, phrase)) continue;
      if (guard?.not_future_tense && futureFramed(line.norm)) continue;
      if (guard?.not_deferred && deferred(line.norm)) continue;
      return { atSec: line.atSec, raw: line.raw, phrase };
    }
  }
  return null;
}

/** true iff a plain (guard-free) occurrence of any phrase exists. */
export function anyPresent(corpus: Corpus, phrases: string[] | undefined): boolean {
  return firstMatch(corpus, phrases) !== null;
}

/** a human deferral ("hold that for now") was spoken about any of these phrases. */
export function deferralSpokenFor(corpus: Corpus, phrases: string[] | undefined): boolean {
  if (!phrases) return false;
  return corpus.lines.some(
    (line) => deferred(line.norm) && phrases.some((p) => contains(line.norm, p)),
  );
}
