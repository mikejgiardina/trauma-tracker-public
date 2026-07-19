import type { ReactNode } from 'react';
import { cn } from '../lib/utils.ts';

/** A titled surface card — the board's structural unit. */
export function Panel({ title, right, children, className }: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-xl border border-border bg-surface p-4', className)}>
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-dim">{title}</h2>
        {right}
      </header>
      {children}
    </section>
  );
}
