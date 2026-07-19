import { useEffect, useRef } from 'react';
import type { Utterance } from '../types.ts';
import { Panel } from './Panel.tsx';

/** Rolling transcript — WHAT was said, never WHO said it. */
export function TranscriptPane({ utterances }: { utterances: Utterance[] }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [utterances.length]);

  return (
    <Panel title="Transcript" className="flex min-h-0 flex-col">
      <div className="max-h-64 overflow-y-auto pr-1">
        {utterances.length === 0 ? (
          <p className="text-sm text-text-dim">Waiting for audio…</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {utterances.map((u, i) => (
              <li key={`${u.atSec}-${i}`} className="flex gap-2">
                <span className="shrink-0 font-mono text-xs text-text-dim">{u.t_rel}</span>
                <span className={u.uncertain ? 'italic text-text-dim' : ''}>{u.text}</span>
              </li>
            ))}
          </ul>
        )}
        <div ref={end} />
      </div>
    </Panel>
  );
}
