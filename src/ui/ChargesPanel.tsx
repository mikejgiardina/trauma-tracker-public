import type { ChargeRuntime } from '../types.ts';
import { Panel } from './Panel.tsx';
import { money, statusColor, statusDot } from './format.ts';
import { cn } from '../lib/utils.ts';

const STATUS_LABEL: Record<string, string> = {
  billed: 'Billed', held: 'Held', unresolved: 'Unresolved', declined: 'Declined',
  not_applicable: 'N/A', dormant: 'Dormant',
};

export function ChargesPanel({ charges, total }: { charges: ChargeRuntime[]; total: number }) {
  const shown = charges.filter((c) => c.status !== 'dormant');
  return (
    <Panel
      title="Charges"
      right={<span className="font-mono text-sm text-ok">{money(total)}<span className="ml-1 text-xs text-text-dim">est. billed</span></span>}
    >
      {shown.length === 0 ? (
        <p className="text-sm text-text-dim">No charges captured yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {shown.map((c) => (
            <li key={c.code} className="rounded-lg bg-surface-2 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', statusDot(c.status))} />
                  <span className="truncate text-sm">{c.name}</span>
                </div>
                <div className="flex shrink-0 items-center gap-3 font-mono text-xs">
                  {c.cpt && <span className="text-text-dim">{c.cpt}</span>}
                  <span className={cn('w-20 text-right', statusColor(c.status))}>
                    {c.status === 'billed' ? money(c.price) : STATUS_LABEL[c.status]}
                  </span>
                </div>
              </div>
              {c.reason && <p className="mt-1 text-xs text-text-dim">{c.reason}</p>}
              {c.citation && <p className="mt-0.5 text-xs italic text-text-dim">{c.citation}</p>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
