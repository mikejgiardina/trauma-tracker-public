import type { ActivationDetermination } from '../types.ts';
import { Panel } from './Panel.tsx';
import { cn } from '../lib/utils.ts';

function Cond({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={cn('h-2 w-2 rounded-full', ok ? 'bg-ok' : 'bg-warn')} />
      <span className={ok ? '' : 'text-text-dim'}>{label}</span>
    </div>
  );
}

/** Trauma-activation fee determination — criteria met + the four billing conditions. */
export function ActivationPanel({ activation }: { activation: ActivationDetermination }) {
  return (
    <Panel
      title="Activation fee"
      right={
        <span className={cn('rounded px-2 py-0.5 text-xs font-medium', activation.qualifies ? 'bg-ok/20 text-ok' : 'bg-warn/20 text-warn')}>
          {activation.qualifies ? 'Qualifies' : 'Pending'}
        </span>
      }
    >
      {activation.criteriaMet.length > 0 && (
        <div className="mb-3">
          <div className="mb-1 text-xs uppercase tracking-wide text-text-dim">Criteria met</div>
          <ul className="space-y-1 text-sm">
            {activation.criteriaMet.map((c, i) => (
              <li key={i} className="flex gap-2">
                <span className="shrink-0 rounded bg-surface-2 px-1.5 text-xs text-text-dim">{c.category}</span>
                <span className="min-w-0">
                  <span>{c.criterion}</span>
                  {c.evidence && <span className="ml-1 text-xs text-text-dim">— {c.evidence}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <Cond ok={activation.activationDocumented} label="Documented" />
        <Cond ok={activation.teamResponded} label="Team responded" />
        <Cond ok={activation.prehospitalNotification} label="Prehospital notice" />
        <Cond ok={activation.qualifies} label="Criteria satisfied" />
      </div>
      <p className="mt-3 rounded-lg bg-surface-2 p-2 text-xs text-text-dim">{activation.feeDisposition}</p>
    </Panel>
  );
}
