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
import { revealCanned } from './cannedAdapter.ts';
import { cannedDurationSec } from './cannedTranscript.ts';
import { MicCapture } from './deepgramAdapter.ts';
import { transcribeFile, transcriptDurationSec } from './fileAdapter.ts';
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
  // live/file accumulate here; canned derives from nowSec
  const liveUtter = useRef<Utterance[]>([]);
  const liveItems = useRef<ExtractedItem[]>([]);
  const injected = useRef<Utterance[]>([]);
  const extracting = useRef(false);
  const lastExtractLen = useRef(0);

  const clearTick = () => { if (tick.current) clearInterval(tick.current); tick.current = null; };

  const runExtractor = useCallback(async () => {
    if (extracting.current) return;
    const utter = liveUtter.current;
    if (utter.length === lastExtractLen.current) return;
    lastExtractLen.current = utter.length;
    extracting.current = true;
    try {
      const items = await extract(utter);
      liveItems.current = dedupeItems([...items]);
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
      const elapsed = ((Date.now() - startEpoch.current) / 1000) * speed;
      if (mode === 'canned') {
        const nowSec = Math.min(elapsed, durationRef.current);
        const snap = revealCanned(nowSec);
        const utterances = [...snap.utterances, ...injected.current.filter((i) => i.atSec <= nowSec)]
          .sort((a, b) => a.atSec - b.atSec);
        setState((s) => ({ ...s, nowSec, utterances, items: snap.items, readings: snap.readings }));
        if (nowSec >= durationRef.current) { clearTick(); setState((s) => ({ ...s, status: 'stopped' })); }
      } else {
        const nowSec = Math.min(elapsed, durationRef.current || elapsed);
        void runExtractor();
        const utter = [...liveUtter.current, ...injected.current].sort((a, b) => a.atSec - b.atSec);
        setState((s) => ({ ...s, nowSec, utterances: utter, items: liveItems.current, readings: readingsFromItems(liveItems.current) }));
      }
    }, TICK_MS);
  }, [runExtractor]);

  const start = useCallback(async (mode: CaptureMode) => {
    liveUtter.current = []; liveItems.current = []; injected.current = []; lastExtractLen.current = 0;
    setState((s) => ({ ...s, status: 'running', mode, error: undefined, nowSec: 0, utterances: [], items: [], readings: [] }));
    if (mode === 'canned') {
      durationRef.current = cannedDurationSec;
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

  const stop = useCallback(async () => {
    clearTick();
    if (mic.current) { await mic.current.stop(); await runExtractor(); mic.current = null; }
    setState((s) => ({ ...s, status: 'stopped' }));
  }, [runExtractor]);

  const reset = useCallback(() => {
    clearTick();
    void mic.current?.stop(); mic.current = null;
    liveUtter.current = []; liveItems.current = []; injected.current = []; lastExtractLen.current = 0;
    setState({ status: 'idle', mode: initialMode, nowSec: 0, utterances: [], readings: [], items: [] });
  }, [initialMode]);

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

  return { state, start, startFile, stop, reset, injectAnswer };
}
