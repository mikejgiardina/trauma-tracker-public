import { AlertTriangle } from 'lucide-react';
import type { ActivePrompt } from '../types.ts';
import { cn } from '../lib/utils.ts';

/**
 * The ONE prompt surface. A prompt is a pure render of ledger/lattice state — it
 * retracts itself the instant the room answers (the transcript resolves the gap).
 * The taps are a manual escape hatch, not the mechanism.
 */
export function PromptSurface({ prompt, onResolve, onDefer }: {
  prompt: ActivePrompt | null;
  onResolve: () => void;
  onDefer: () => void;
}) {
  return (
    <section
      className={cn(
        'rounded-xl border p-4 transition-colors',
        prompt ? 'border-warn/60 bg-warn/10' : 'border-dashed border-border bg-surface/50',
      )}
      aria-live="polite"
    >
      <header className="mb-2 flex items-center gap-2">
        <AlertTriangle size={16} className={prompt ? 'text-warn' : 'text-text-dim'} />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-dim">
          Prompt {prompt ? `· ${prompt.source}` : 'surface'}
        </h2>
      </header>

      {prompt ? (
        <div>
          <p className="text-lg font-medium leading-snug">{prompt.text}</p>
          {prompt.subline && <p className="mt-1 text-sm text-text-dim">{prompt.subline}</p>}
          <div className="mt-3 flex gap-2">
            <button
              onClick={onResolve}
              className="rounded-lg bg-ok/20 px-4 text-sm font-medium text-ok hover:bg-ok/30"
            >
              Acknowledge
            </button>
            <button
              onClick={onDefer}
              className="rounded-lg bg-surface-2 px-4 text-sm text-text-dim hover:bg-surface-2/70"
            >
              Not now
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-text-dim">
          No open prompt. The board is current — a prompt appears only when a material gap is heard,
          and clears itself when the room answers.
        </p>
      )}
    </section>
  );
}
