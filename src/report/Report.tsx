import { createPortal } from 'react-dom';
import { FileText, Printer, X } from 'lucide-react';
import type { ChargeRuntime, EngineState, ExtractedItem } from '../types.ts';
import { money, tRel } from '../ui/format.ts';
import './print.css';

const CHARGE_STATUS: Record<string, string> = {
  billed: 'Billed', held: 'Held', unresolved: 'Unresolved', declined: 'Declined', not_applicable: 'N/A', dormant: '—',
};

function amount(c: ChargeRuntime): string {
  return c.status === 'billed' ? money(c.price) : c.status === 'declined' || c.status === 'unresolved' ? '$0' : '—';
}

export function Report({ engine, items, onClose }: {
  engine: EngineState;
  items: ExtractedItem[];
  onClose: () => void;
}) {
  const events = items.filter((i) => i.type === 'event');
  const valueItems = items.filter((i) => i.type === 'value');
  const shownCharges = engine.charges.filter((c) => c.status !== 'dormant');
  const atRisk = engine.gaps.reduce((s, g) => s + (g.dollarImpact ?? 0), 0);

  return createPortal(
    <div className="report-overlay">
      <div className="report-chrome mx-auto mb-4 flex w-[8.5in] items-center justify-between text-white">
        <span className="flex items-center gap-2 text-sm"><FileText size={16} /> Encounter report — 2 pages</span>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-lg bg-white/15 px-4 text-sm hover:bg-white/25">
            <Printer size={15} /> Print / Save PDF
          </button>
          <button onClick={onClose} className="flex items-center gap-1.5 rounded-lg bg-white/15 px-4 text-sm hover:bg-white/25">
            <X size={15} /> Close
          </button>
        </div>
      </div>

      {/* ── PAGE 1 — Nursing transcription sheet ── */}
      <section className="report-page">
        <header className="mb-4 flex items-start justify-between border-b-2 border-slate-800 pb-2">
          <div>
            <h1 className="font-bold">Trauma Resuscitation — Nursing Record</h1>
            <p className="text-slate-500">Ambient capture · deterministic transcription sheet</p>
          </div>
          <div className="text-right text-slate-600">
            <div>Case <span className="font-mono font-semibold">Bed 4 / SYN-0007</span></div>
            <div>Bay time {tRel(engine.nowSec)}</div>
            <div className="text-[10px] uppercase tracking-wide text-amber-700">Synthetic · no PHI</div>
          </div>
        </header>

        <div className="mb-4 grid grid-cols-3 gap-2">
          {[
            ['Age', engine.values.Age != null ? `${engine.values.Age} yr` : '—'],
            ['Sex', engine.values.Sex ?? '—'],
            ['Weight', engine.values.Weight != null ? `${engine.values.Weight} kg` : '—'],
          ].map(([k, v]) => (
            <div key={k} className="rounded border border-slate-300 px-2 py-1">
              <div className="text-[9px] uppercase tracking-wide text-slate-500">{k}</div>
              <div className="font-mono">{v}</div>
            </div>
          ))}
        </div>

        <h2 className="mb-1 font-semibold">Timed events</h2>
        <table className="mb-4 w-full border-collapse">
          <tbody>
            {events.map((e, i) => (
              <tr key={i} className="border-b border-slate-200">
                <td className="w-16 py-1 align-top font-mono text-slate-500">{e.t_rel}</td>
                <td className="py-1 align-top">{e.label}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <h2 className="mb-1 font-semibold">Values heard</h2>
            <table className="w-full border-collapse">
              <tbody>
                {valueItems.map((v, i) => (
                  <tr key={i} className="border-b border-slate-200">
                    <td className="w-14 py-0.5 font-mono text-slate-500">{v.t_rel}</td>
                    <td className="py-0.5">{v.name}</td>
                    <td className="py-0.5 text-right font-mono">{v.value}{v.unit ? ` ${v.unit}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h2 className="mb-1 font-semibold">Score timeline</h2>
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-300 text-left text-slate-500">
                  <th className="py-0.5 font-normal">T</th><th className="py-0.5 font-normal">GCS</th>
                  <th className="py-0.5 font-normal">SI</th><th className="py-0.5 font-normal">RTS</th>
                </tr>
              </thead>
              <tbody>
                {engine.scoreTimeline.map((p) => (
                  <tr key={p.atSec} className="border-b border-slate-200 font-mono">
                    <td className="py-0.5 text-slate-500">{p.t_rel}</td>
                    <td className="py-0.5">{p.GCS ?? '—'}</td>
                    <td className="py-0.5">{p.shockIndex?.toFixed(2) ?? '—'}</td>
                    <td className="py-0.5">{p.RTS?.toFixed(2) ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── PAGE 2 — RCM report ── */}
      <section className="report-page">
        <header className="mb-4 flex items-start justify-between border-b-2 border-slate-800 pb-2">
          <div>
            <h1 className="font-bold">Revenue Cycle — Charge & Compliance Report</h1>
            <p className="text-slate-500">Charges from the obligations ledger · CPT from code-map, not the flat chargemaster</p>
          </div>
          <div className="text-right">
            <div className="text-[9px] uppercase tracking-wide text-slate-500">Est. billed</div>
            <div className="font-mono text-lg font-bold text-emerald-700">{money(engine.estimatedTotal)}</div>
          </div>
        </header>

        <h2 className="mb-1 font-semibold">Charges</h2>
        <table className="mb-4 w-full border-collapse">
          <thead>
            <tr className="border-b border-slate-300 text-left text-slate-500">
              <th className="py-1 font-normal">Charge</th>
              <th className="py-1 font-normal">CPT/HCPCS</th>
              <th className="py-1 font-normal">Status</th>
              <th className="py-1 text-right font-normal">Amount</th>
            </tr>
          </thead>
          <tbody>
            {shownCharges.map((c) => (
              <tr key={c.code} className="border-b border-slate-200 align-top">
                <td className="py-1">
                  {c.name}
                  {c.reason && <div className="text-[10px] text-slate-500">{c.reason}</div>}
                  {c.citation && <div className="text-[10px] italic text-slate-500">{c.citation}</div>}
                </td>
                <td className="py-1 font-mono">{c.cpt ?? '—'}</td>
                <td className="py-1">{CHARGE_STATUS[c.status]}</td>
                <td className="py-1 text-right font-mono">{amount(c)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mb-4 grid grid-cols-2 gap-6">
          <div>
            <h2 className="mb-1 font-semibold">Measure compliance</h2>
            <table className="w-full border-collapse">
              <tbody>
                {engine.measures.map((m) => (
                  <tr key={m.id} className="border-b border-slate-200">
                    <td className="py-1">{m.name}{m.detail && <div className="text-[10px] text-slate-500">{m.detail}</div>}</td>
                    <td className="py-1 text-right font-semibold uppercase text-[10px]">{m.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h2 className="mb-1 font-semibold">Trauma activation fee</h2>
            <div className="rounded border border-slate-300 p-2">
              <div className="mb-1 font-semibold">{engine.activation.qualifies ? 'Qualifies' : 'Pending'}</div>
              <ul className="mb-2 list-disc pl-4 text-[10px]">
                {engine.activation.criteriaMet.map((c, i) => (
                  <li key={i}><span className="text-slate-500">{c.category}:</span> {c.criterion}</li>
                ))}
              </ul>
              <p className="text-[10px] text-slate-600">{engine.activation.feeDisposition}</p>
            </div>
          </div>
        </div>

        <h2 className="mb-1 font-semibold">Unresolved gaps at disposition</h2>
        {engine.gaps.length === 0 ? (
          <p className="text-slate-500">None — every material obligation resolved before disposition.</p>
        ) : (
          <table className="w-full border-collapse">
            <tbody>
              {engine.gaps.map((g) => (
                <tr key={g.obligationId} className="border-b border-slate-200 align-top">
                  <td className="py-1">
                    <div className="font-medium">{g.label}</div>
                    <div className="text-[10px] text-slate-500">{g.text}</div>
                  </td>
                  <td className="w-20 py-1 text-right font-mono">{g.dollarImpact != null ? money(g.dollarImpact) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {atRisk > 0 && (
          <p className="mt-2 text-right text-slate-600">
            Deferred / at-risk pending reconciliation: <span className="font-mono font-semibold">{money(atRisk)}</span>
          </p>
        )}

        <footer className="mt-6 border-t border-slate-300 pt-2 text-[9px] text-slate-500">
          Synthetic data only, no PHI. Clinical values marked NEEDS-CLINICIAN / NEEDS-CODER are unsigned proposals.
          Charges derive from the obligations ledger; CPT selection uses each obligation's code-map.
        </footer>
      </section>
    </div>,
    document.body,
  );
}
