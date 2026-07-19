import { useMemo, useState } from 'react';
import { Stethoscope } from 'lucide-react';
import type { CaptureMode } from './capture/adapter.ts';
import { useCapture } from './capture/useCapture.ts';
import { recompute, defaultConfig } from './engine/engine.ts';
import { DemographicsBar } from './ui/DemographicsBar.tsx';
import { ScoresPanel } from './ui/ScoresPanel.tsx';
import { ChargesPanel } from './ui/ChargesPanel.tsx';
import { MeasuresPanel } from './ui/MeasuresPanel.tsx';
import { ActivationPanel } from './ui/ActivationPanel.tsx';
import { ValuesScratchpad } from './ui/ValuesScratchpad.tsx';
import { PromptSurface } from './ui/PromptSurface.tsx';
import { TranscriptPane } from './ui/TranscriptPane.tsx';
import { Controls } from './ui/Controls.tsx';
import { Report } from './report/Report.tsx';

const envMode = (import.meta.env.VITE_DEMO_MODE as string | undefined) === 'live' ? 'live' : 'canned';

export default function App() {
  const [mode, setMode] = useState<CaptureMode>(envMode);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [showReport, setShowReport] = useState(false);
  const { state, start, startFile, stop, reset, injectAnswer } = useCapture(mode);

  const engine = useMemo(
    () => recompute({ utterances: state.utterances, readings: state.readings, nowSec: state.nowSec, dismissed }, defaultConfig),
    [state.utterances, state.readings, state.nowSec, dismissed],
  );

  function dismiss(defer: boolean) {
    const p = engine.activePrompt;
    if (!p) return;
    const id = p.obligationId ?? p.nodeId;
    if (id) setDismissed((d) => (d.includes(id) ? d : [...d, id]));
    if (defer) injectAnswer('hold that for now');
  }

  function onReset() {
    reset();
    setDismissed([]);
    setShowReport(false);
  }

  return (
    <div className="mx-auto flex min-h-full max-w-7xl flex-col gap-4 p-4">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Stethoscope size={22} className="text-accent" />
          <h1 className="text-lg font-semibold">Trauma Tracker <span className="text-text-dim">· ED ambient RCM</span></h1>
          <span className="ml-2 rounded bg-surface-2 px-2 py-0.5 text-xs text-text-dim">synthetic · no PHI</span>
        </div>
        <Controls
          mode={mode}
          setMode={setMode}
          status={state.status}
          nowSec={state.nowSec}
          resuscitationActive={engine.resuscitationActive}
          onStart={() => start(mode)}
          onStop={() => void stop()}
          onReset={onReset}
          onFile={(f) => startFile(f)}
          onReport={() => setShowReport(true)}
        />
        {state.error && (
          <p className="rounded-lg border border-crit/50 bg-crit/10 px-3 py-2 text-sm text-crit">
            {state.error}
          </p>
        )}
      </header>

      <DemographicsBar values={engine.values} />

      <PromptSurface prompt={engine.activePrompt} onResolve={() => dismiss(false)} onDefer={() => dismiss(true)} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <ScoresPanel scores={engine.scores} timeline={engine.scoreTimeline} values={engine.values} />
          <ChargesPanel charges={engine.charges} total={engine.estimatedTotal} />
          <MeasuresPanel measures={engine.measures} />
        </div>
        <div className="flex flex-col gap-4">
          <ActivationPanel activation={engine.activation} />
          <ValuesScratchpad readings={state.readings} />
          <TranscriptPane utterances={state.utterances} />
        </div>
      </div>

      {showReport && (
        <Report engine={engine} items={state.items} onClose={() => setShowReport(false)} />
      )}
    </div>
  );
}
