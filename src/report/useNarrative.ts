// src/report/useNarrative.ts
// Builds the nurse's note INCREMENTALLY: one sentence per captured event, composed with
// the previous two as context (flow + dedup), as the events arrive during the resus.
// The narrative is ready by report time — no big end-of-case call to hit a timeout /
// character / reply limit. Best-effort: a failed or empty sentence is skipped.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExtractedItem } from '../types.ts';

export interface NarrativeLine {
  t_rel: string;
  text: string;
}

async function composeSentence(
  row: { t_rel: string; label: string; text?: string },
  prev: string[],
): Promise<string> {
  const r = await fetch('/.netlify/functions/note', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ row, prev }),
  });
  const j = (await r.json().catch(() => null)) as { sentence?: string; error?: string } | null;
  if (!r.ok || !j || j.error) throw new Error(j?.error ?? `note ${r.status}`);
  return typeof j.sentence === 'string' ? j.sentence : '';
}

export function useNarrative(events: ExtractedItem[]) {
  const [lines, setLines] = useState<NarrativeLine[]>([]);
  const [composing, setComposing] = useState(false);
  const linesRef = useRef<NarrativeLine[]>([]);
  const doneCount = useRef(0);
  const busy = useRef(false);
  const gen = useRef(0); // bumped on reset to abandon an in-flight pump
  const eventsRef = useRef<ExtractedItem[]>(events);
  eventsRef.current = events;

  const pump = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const myGen = gen.current;
    setComposing(true);
    try {
      while (doneCount.current < eventsRef.current.length) {
        if (gen.current !== myGen) return; // reset happened mid-flight
        const idx = doneCount.current;
        const ev = eventsRef.current[idx];
        const prev = linesRef.current.slice(-2).map((l) => l.text);
        let sentence = '';
        try {
          sentence = await composeSentence({ t_rel: ev.t_rel, label: ev.label, text: ev.raw }, prev);
        } catch {
          sentence = '';
        }
        if (gen.current !== myGen) return;
        if (sentence) {
          linesRef.current = [...linesRef.current, { t_rel: ev.t_rel, text: sentence }];
          setLines(linesRef.current);
        }
        doneCount.current = idx + 1;
      }
    } finally {
      if (gen.current === myGen) {
        busy.current = false;
        setComposing(false);
      }
    }
  }, []);

  useEffect(() => {
    void pump();
  }, [events.length, pump]);

  const reset = useCallback(() => {
    gen.current += 1;
    linesRef.current = [];
    doneCount.current = 0;
    busy.current = false;
    setLines([]);
    setComposing(false);
  }, []);

  return { lines, composing, reset };
}
