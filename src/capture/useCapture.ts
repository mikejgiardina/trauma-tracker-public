/**
 * useCapture — owns the capture source + the clock that advances `nowSec`.
 *
 * Emits { utterances, readings, items, nowSec, status }. The engine recompute is a
 * pure function of these, run by the UI on every change. Tap-answers at the prompt
 * surface are injected as synthetic utterances so the "app heard the resolution"
 * path is uniform across canned / live / file.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExtractedItem, Utterance, ValueReading } from '../types.ts';
import type { CaptureMode } from './adapter.ts';
import { cannedDurationSec, cannedUtterances } from './cannedTranscript.ts';
import { MicCapture } from './deepgramAdapter.ts';
import { transcribeFile, transcriptDurationSec } from './fileAdapter.ts';
import { parseTranscript } from './transcriptAdapter.ts';
import { dedupeItems, extract, readingsFromItems } from './extractorClient.ts';

export type CaptureStatus = 'idle' | 'running' | 'stopped' | 'error';

export interface CaptureState {
  status: CaptureStatus;
  mode: CaptureMode;
  nowSec: number;
  utterances: Utterance[];
  readings: ValueReading[];
  items: ExtractedItem[];
  error?: string;
}

const TICK_MS = 400;

/**
 * When each line is HEARD IN FULL, not when the speaker starts it.
 *
 * A timestamp marks the start of an utterance, but the line takes seconds to say — so
 * revealing at `atSec` puts words on screen before they leave the speaker's mouth (worst
 * on long lines: the tail of a 10-second sentence could show ~8s early). Each line is
 * therefore revealed at `atSec + how long it takes to say`, so the transcript can never
 * run ahead of the audio. This subsumes the old fixed lag, which only shifted the start.
 *
 * ~0.45 s/word is deliberately generous — late is fine, early is the bug. The estimate is
 * then capped at the next line's start: once the speaker has moved on, the previous line
 * is certainly complete, so the cap bounds any error in the rate.
 */
function revealTimes(utter: Utterance[]): number[] {
  return utter.map((u, i) => {
    const words = u.text.trim().split(/\s+/).length;
    const spoken = u.atSec + Math.max(1, words * 0.45);
    const next = utter[i + 1]?.atSec;
    return next != null ? Math.min(spoken, next) : spoken;
  });
}

/** ?speed=N fast-forwards the canned replay clock (rehearsal / test); default 1×. */
function replaySpeed(): number {
  if (typeof location === 'undefined') return 1;
  const n = Number(new URLSearchParams(location.search).get('speed'));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function useCapture(initialMode: CaptureMode) {
  const [state, setState] = useState<CaptureState>({
    status: 'idle', mode: initialMode, nowSec: 0, utterances: [], readings: [], items: [],
  });

  const startEpoch = useRef(0);
  const durationRef = useRef(cannedDurationSec);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const mic = useRef<MicCapture | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  // live/file accumulate here; canned derives from nowSec
  const liveUtter = useRef<Utterance[]>([]);
  const liveItems = useRef<ExtractedItem[]>([]);
  const injected = useRef<Utterance[]>([]);
  const transcriptUtter = useRef<Utterance[]>([]); // injected transcript, revealed over time
  const revealAt = useRef<number[]>([]); // parallel to transcriptUtter: when each line is fully spoken
  const extracting = useRef(false);
  const lastExtractLen = useRef(0);

  const clearTick = () => { if (tick.current) clearInterval(tick.current); tick.current = null; };
  const stopAudio = useCallback(() => { audio.current?.pause(); audio.current = null; }, []);

  const runExtractor = useCallback(async () => {
    if (extracting.current) return;
    const utter = liveUtter.current;
    const from = lastExtractLen.current;
    if (utter.length <= from) return;
    lastExtractLen.current = utter.length;
    extracting.current = true;
    try {
      // Fix 1: send only the new window + items already captured; accumulate + dedupe.
      const newItems = await extract(utter.slice(from), liveItems.current);
      liveItems.current = dedupeItems([...liveItems.current, ...newItems]);
    } catch (e) {
      setState((s) => ({ ...s, error: e instanceof Error ? e.message : String(e) }));
    } finally {
      extracting.current = false;
    }
  }, []);

  const startClock = useCallback((mode: CaptureMode) => {
    startEpoch.current = Date.now();
    const speed = mode === 'canned' ? replaySpeed() : 1;
    tick.current = setInterval(() => {
      // Canned: when the demo audio is playing it IS the clock, so the panels populate
      // in lockstep with what's heard. Falls back to the wall clock if the audio isn't
      // playing (autoplay blocked, or ?speed rehearsal).
      const onAudio = mode === 'canned' && audio.current != null && !audio.current.paused;
      const elapsed = onAudio
        ? audio.current!.currentTime // the demo audio IS the clock
        : ((Date.now() - startEpoch.current) / 1000) * speed;
      if (mode === 'canned' || mode === 'transcript') {
        // Canned + transcript share one path: reveal timed utterances as the clock
        // reaches them and feed the LIVE extractor (windowed) exactly as production would.
        // Canned's clock is the demo audio (elapsed = audio.currentTime − lag, above), so
        // the panels track what's heard; transcript runs on the wall clock, no audio/STT.
        const nowSec = Math.min(elapsed, durationRef.current);
        // a line appears once it has been SAID, not when it starts (revealTimes)
        liveUtter.current = transcriptUtter.current.filter((_, i) => revealAt.current[i] <= nowSec);
        void runExtractor();
        const utter = [...liveUtter.current, ...injected.current].sort((a, b) => a.atSec - b.atSec);
        setState((s) => ({ ...s, nowSec, utterances: utter, items: liveItems.current, readings: readingsFromItems(liveItems.current) }));
        if (nowSec >= durationRef.current) { clearTick(); stopAudio(); setState((s) => ({ ...s, status: 'stopped' })); }
      } else {
        const nowSec = Math.min(elapsed, durationRef.current || elapsed);
        void runExtractor();
        const utter = [...liveUtter.current, ...injected.current].sort((a, b) => a.atSec - b.atSec);
        setState((s) => ({ ...s, nowSec, utterances: utter, items: liveItems.current, readings: readingsFromItems(liveItems.current) }));
      }
    }, TICK_MS);
  }, [runExtractor, stopAudio]);

  const start = useCallback(async (mode: CaptureMode) => {
    liveUtter.current = []; liveItems.current = []; injected.current = []; lastExtractLen.current = 0;
    setState((s) => ({ ...s, status: 'running', mode, error: undefined, nowSec: 0, utterances: [], items: [], readings: [] }));
    if (mode === 'canned') {
      transcriptUtter.current = cannedUtterances; // the reveal source, gated by audio time
      revealAt.current = revealTimes(cannedUtterances);
      durationRef.current = cannedDurationSec;
      // Play the demo recording OUTWARD through the speakers (Start is a user gesture,
      // so audible autoplay is allowed) and let it drive the reveal. Skipped on
      // ?speed≠1 (rehearsal) or if the asset/autoplay fails — then it's a silent replay.
      if (replaySpeed() === 1) {
        const el = new Audio('/demo-audio.mp3');
        audio.current = el;
        void el.play().catch(() => { audio.current = null; });
      }
      startClock('canned');
    } else if (mode === 'live') {
      try {
        mic.current = new MicCapture({
          onUtterances: (u) => { liveUtter.current = u; },
          onError: (msg) => setState((s) => ({ ...s, error: msg })),
        });
        await mic.current.start();
        durationRef.current = 0; // open-ended; nowSec follows wall clock
        startClock('live');
      } catch (e) {
        setState((s) => ({ ...s, status: 'error', error: e instanceof Error ? e.message : String(e) }));
      }
    }
  }, [startClock]);

  const startFile = useCallback(async (file: File) => {
    setState((s) => ({ ...s, status: 'running', mode: 'file', error: undefined, nowSec: 0, utterances: [], items: [], readings: [] }));
    try {
      const utter = await transcribeFile(file);
      liveUtter.current = utter;
      durationRef.current = transcriptDurationSec(utter) || 1;
      lastExtractLen.current = 0;
      await runExtractor();
      startClock('file');
    } catch (e) {
      setState((s) => ({ ...s, status: 'error', error: e instanceof Error ? e.message : String(e) }));
    }
  }, [runExtractor, startClock]);

  /** Inject a pre-written transcript and run it through the extractor over time — no STT. */
  const startTranscript = useCallback((text: string) => {
    const utter = parseTranscript(text);
    liveUtter.current = []; liveItems.current = []; injected.current = []; lastExtractLen.current = 0;
    transcriptUtter.current = utter;
    revealAt.current = revealTimes(utter);
    // run long enough for the last line to be fully "spoken" and its extract to land
    durationRef.current = revealAt.current.length ? revealAt.current[revealAt.current.length - 1] + 4 : 1;
    if (!utter.length) {
      setState((s) => ({ ...s, status: 'error', error: 'No timestamped lines found in the transcript.' }));
      return;
    }
    setState((s) => ({ ...s, status: 'running', mode: 'transcript', error: undefined, nowSec: 0, utterances: [], items: [], readings: [] }));
    startClock('transcript');
  }, [startClock]);

  const stop = useCallback(async () => {
    clearTick();
    stopAudio();
    if (mic.current) { await mic.current.stop(); await runExtractor(); mic.current = null; }
    setState((s) => ({ ...s, status: 'stopped' }));
  }, [runExtractor, stopAudio]);

  const reset = useCallback(() => {
    clearTick();
    stopAudio();
    void mic.current?.stop(); mic.current = null;
    liveUtter.current = []; liveItems.current = []; injected.current = []; transcriptUtter.current = []; revealAt.current = []; lastExtractLen.current = 0;
    setState({ status: 'idle', mode: initialMode, nowSec: 0, utterances: [], readings: [], items: [] });
  }, [initialMode, stopAudio]);

  /** inject a spoken answer (tap on the prompt surface) into the transcript. */
  const injectAnswer = useCallback((text: string) => {
    setState((s) => {
      const atSec = s.nowSec;
      const u: Utterance = { t_rel: `T+${Math.floor(atSec / 60)}:${String(Math.floor(atSec % 60)).padStart(2, '0')}`, atSec, text };
      injected.current = [...injected.current, u];
      if (s.mode === 'canned') {
        return { ...s, utterances: [...s.utterances, u].sort((a, b) => a.atSec - b.atSec) };
      }
      return s;
    });
  }, []);

  useEffect(() => () => clearTick(), []);

  return { state, start, startFile, startTranscript, stop, reset, injectAnswer };
}
