import type { ValuesState } from '../types.ts';
import { cn } from '../lib/utils.ts';

/** Age / Sex / Weight chips — reads the ledger's value stream (2-of-3 in the demo). */
export function DemographicsBar({ values }: { values: ValuesState }) {
  const chips: { label: string; value: string | null }[] = [
    { label: 'Age', value: values.Age != null ? `${values.Age}` : null },
    { label: 'Sex', value: values.Sex },
    { label: 'Weight', value: values.Weight != null ? `${values.Weight} kg` : null },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <div
          key={c.label}
          className={cn(
            'flex items-baseline gap-2 rounded-lg border px-3 py-1.5 text-sm',
            c.value ? 'border-border bg-surface-2' : 'border-dashed border-border text-text-dim',
          )}
        >
          <span className="text-xs uppercase tracking-wide text-text-dim">{c.label}</span>
          <span className="font-mono">{c.value ?? '—'}</span>
        </div>
      ))}
    </div>
  );
}
