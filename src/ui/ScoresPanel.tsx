import type { ScoreSnapshot, ScoreTimelinePoint, ValuesState } from '../types.ts';
import { Panel } from './Panel.tsx';
import { cn } from '../lib/utils.ts';

function Metric({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-surface-2 p-3">
      <div className="text-xs uppercase tracking-wide text-text-dim">{label}</div>
      <div className={cn('font-mono text-2xl', tone)}>{value}</div>
      {hint && <div className="text-xs text-text-dim">{hint}</div>}
    </div>
  );
}

export function ScoresPanel({ scores, timeline, values }: {
  scores: ScoreSnapshot;
  timeline: ScoreTimelinePoint[];
  values: ValuesState;
}) {
  const si = scores.shockIndex;
  const siTone = si == null ? '' : si >= 1.0 ? 'text-crit' : si > 0.9 ? 'text-warn' : 'text-ok';
  const gcsTone = scores.GCS == null ? '' : scores.GCS < 9 ? 'text-crit' : scores.GCS < 13 ? 'text-warn' : 'text-ok';

  return (
    <Panel title="Trauma scores" right={<span className="text-xs text-text-dim">deterministic · no model</span>}>
      <div className="grid grid-cols-3 gap-2">
        <Metric label="GCS" value={scores.GCS != null ? String(scores.GCS) : '—'} tone={gcsTone} />
        <Metric label="Shock Index" value={si != null ? si.toFixed(2) : '—'} hint={si != null && si >= 1 ? 'critical ≥1.0' : si != null && si > 0.9 ? 'occult shock' : undefined} tone={siTone} />
        <Metric label="RTS" value={scores.RTS != null ? scores.RTS.toFixed(2) : '—'} hint="lower = worse" />
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
        {(['HR', 'SBP', 'RR', 'SpO2'] as const).map((k) => {
          const v = k === 'SBP' ? values.SBP : values[k];
          return (
            <div key={k} className="rounded bg-surface-2 py-1.5">
              <div className="text-text-dim">{k}</div>
              <div className="font-mono">{v != null ? v : '—'}</div>
            </div>
          );
        })}
      </div>
      {timeline.length > 1 && (
        <div className="mt-3">
          <div className="mb-1 text-xs uppercase tracking-wide text-text-dim">Trend</div>
          <ul className="space-y-1 text-xs">
            {timeline.map((p) => (
              <li key={p.atSec} className="flex justify-between font-mono text-text-dim">
                <span>{p.t_rel}</span>
                <span>GCS {p.GCS ?? '—'} · SI {p.shockIndex?.toFixed(2) ?? '—'} · RTS {p.RTS?.toFixed(2) ?? '—'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}
