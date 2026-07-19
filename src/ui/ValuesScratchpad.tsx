import type { ValueReading } from '../types.ts';
import { Panel } from './Panel.tsx';
import { tRel } from './format.ts';

/** "Values heard" — the latest reading per name, newest first. */
export function ValuesScratchpad({ readings }: { readings: ValueReading[] }) {
  const latest = new Map<string, ValueReading>();
  for (const r of readings) latest.set(r.name, r);
  const rows = [...latest.values()].sort((a, b) => b.heardAtSec - a.heardAtSec);

  return (
    <Panel title="Values heard">
      {rows.length === 0 ? (
        <p className="text-sm text-text-dim">Listening…</p>
      ) : (
        <ul className="space-y-1 font-mono text-sm">
          {rows.map((r) => (
            <li key={r.name} className="flex items-baseline justify-between gap-2">
              <span className="text-text-dim">{r.name}</span>
              <span className="flex-1 border-b border-dashed border-border/50" />
              <span>{r.value}{r.unit ? ` ${r.unit}` : ''}</span>
              <span className="text-xs text-text-dim">{tRel(r.heardAtSec)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
