import type { MeasureResult } from '../types.ts';
import { Panel } from './Panel.tsx';
import { statusColor, statusDot } from './format.ts';
import { cn } from '../lib/utils.ts';

const LABEL: Record<string, string> = { met: 'Met', open: 'Open', missed: 'Missed', not_applicable: 'N/A' };

export function MeasuresPanel({ measures }: { measures: MeasureResult[] }) {
  return (
    <Panel title="Measure compliance">
      {measures.length === 0 ? (
        <p className="text-sm text-text-dim">No case-relevant measures yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {measures.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className={cn('h-2 w-2 shrink-0 rounded-full', statusDot(m.status))} />
                <div className="min-w-0">
                  <div className="truncate text-sm">{m.name}</div>
                  {m.detail && <div className="text-xs text-text-dim">{m.detail}</div>}
                </div>
              </div>
              <span className={cn('shrink-0 font-mono text-xs', statusColor(m.status))}>{LABEL[m.status]}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
