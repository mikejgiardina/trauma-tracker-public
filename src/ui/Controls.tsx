import { useRef } from 'react';
import { FileText, Mic, Play, Radio, RotateCcw, Square } from 'lucide-react';
import type { CaptureMode } from '../capture/adapter.ts';
import type { CaptureStatus } from '../capture/useCapture.ts';
import { tRel } from './format.ts';
import { cn } from '../lib/utils.ts';

const MODES: { id: CaptureMode; label: string; icon: typeof Mic }[] = [
  { id: 'canned', label: 'Canned', icon: Play },
  { id: 'live', label: 'Live mic', icon: Mic },
  { id: 'file', label: 'File', icon: FileText },
];

export function Controls({
  mode, setMode, status, nowSec, resuscitationActive, onStart, onStop, onReset, onFile, onReport,
}: {
  mode: CaptureMode;
  setMode: (m: CaptureMode) => void;
  status: CaptureStatus;
  nowSec: number;
  resuscitationActive: boolean;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  onFile: (f: File) => void;
  onReport: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const running = status === 'running';
  const started = status !== 'idle';

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* mode selector */}
      <div className="flex overflow-hidden rounded-lg border border-border">
        {MODES.map((m) => {
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              disabled={running}
              onClick={() => setMode(m.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 text-sm',
                mode === m.id ? 'bg-accent text-white' : 'bg-surface text-text-dim hover:bg-surface-2',
                running && 'opacity-50',
              )}
            >
              <Icon size={14} /> {m.label}
            </button>
          );
        })}
      </div>

      {/* transport */}
      {!running ? (
        mode === 'file' ? (
          <>
            <button onClick={() => fileInput.current?.click()} className="flex items-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:opacity-90">
              <FileText size={16} /> Choose audio…
            </button>
            <input ref={fileInput} type="file" accept="audio/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
          </>
        ) : (
          <button onClick={onStart} className="flex items-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:opacity-90">
            {mode === 'live' ? <Mic size={16} /> : <Play size={16} />} Start
          </button>
        )
      ) : (
        <button onClick={onStop} className="flex items-center gap-1.5 rounded-lg bg-crit px-4 text-sm font-medium text-white hover:opacity-90">
          <Square size={16} /> Stop
        </button>
      )}

      {started && (
        <button onClick={onReset} className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 text-sm text-text-dim hover:bg-surface">
          <RotateCcw size={14} /> Reset
        </button>
      )}

      <div className="ml-auto flex items-center gap-3">
        {resuscitationActive && (
          <span className="flex items-center gap-1.5 text-sm text-crit">
            <Radio size={14} className="animate-pulse" /> RESUS
          </span>
        )}
        <span className="font-mono text-lg tabular-nums">{tRel(nowSec)}</span>
        <button
          onClick={onReport}
          disabled={!started}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-2 disabled:opacity-40"
        >
          <FileText size={16} /> Generate report
        </button>
      </div>
    </div>
  );
}
