# Trauma Tracker

**A real-time ED trauma registrar.** Ambient voice capture is the commodity base — Trauma Tracker is the layer on top: while a trauma resuscitation is happening, it listens and does the documentation, quality-measure, and billing work the team can't touch while they're saving a life.

Synthetic data only. No PHI, by design.

## The problem

An ED trauma resuscitation generates a documentation, core-measure, and billing burden nobody is free to handle in the moment. Charges leak. Core-measure clocks — trauma-activation response, airway, sepsis, STEMI — get reconstructed from memory hours later. Accreditation and reimbursement both hinge on times nobody had a hand free to write down.

## The idea

From the same live audio, specialized agents **decide and produce** — they don't just display:

- **Extract** — pull values and interventions as they're spoken (GCS, HR, BP, activation, IV access, type & cross, intubation), timestamped.
- **Score** — compute and track trauma scores live as the patient changes (e.g. Shock Index, RTS).
- **Clocks** — watch accreditation / core-measure windows (airway secured, surgeon-at-bedside) and mark them met or open.
- **Charge integrity** — fire a charge only when the documentation that code requires is present (e.g. intubation confirmed by EtCO₂ + bilateral breath sounds).
- **Reimbursement / activation** — make the trauma-activation determination against criteria, with the evidence cited and open conditions printed as open.

A human stays in the loop: the tool asks ("missed capture, or not yet performed?"), it doesn't accuse — and every correction is supervision signal.

## The deliverable

The product is the **record and the agents**, not the screen. One click generates a two-page report:

1. **Nursing transcription sheet** — every event + timestamp, ready to drop into a paper chart.
2. **RCM report** — captured charges + estimated total, measure compliance, and the trauma-activation determination with evidence cited and an **abstractor's sign-off line**. The tool presents the determination; a human signs it.

Runs on one device, no EHR integration required — a rural trauma bay still on paper prints this and charts from it; a metro center hands the capture layer to its EHR or ambient-scribe suite.

**Roadmap:** EHR write-back, payor prior-auth eligibility, full injury abstraction, and a supervision-driven data flywheel.

## Repo layout

```
src/
├── engine/     deterministic recompute — ledger · walker · clocks · charges ·
│               measures · scores · matcher (all code, no model)
├── capture/    mic + swappable STT client · canned replay · extractor client
├── ui/         live board · values-heard scratchpad · the single prompt surface
├── report/     2-page print-CSS PDF (nursing sheet + RCM report), no PDF library
├── data/       reference rulebooks — obligations · activation lattice · charges ·
│               measures · scores (the JSON is the rulebook; the engine plays by it)
└── types.ts    the frozen shared contract
netlify/functions/   claude.ts (the one live model call) · stt.ts (swappable STT)
tools/               score table-test · reference-integrity lint
prompts/ · fixtures/ reference prompt text + the canned trauma case
```

## Running

```
npm install
npm run dev            # http://localhost:5173
```

**Canned mode (default — zero keys).** Hit **Start**: the bundled trauma case replays, the
board fills, scores worsen, the vitals-freshness prompt fires and retracts itself, charges and
measures land, and **Generate report** prints the two pages (browser Print → *Save as PDF*).
Append `?speed=30` to fast-forward the replay for rehearsal.

**Live mode.** Copy `.env.example` → `.env` and set `ANTHROPIC_API_KEY`, `DEEPGRAM_API_KEY`,
`STT_VENDOR=deepgram`. `npm run dev` serves the serverless functions locally — mic → `/stt`
(Deepgram Nova-3 Medical, keyterm-biased) → transcript → `/claude` (Extractor/Scribe) → the same
board. `File` mode uploads a clip through the identical pipeline; keys never reach the browser.

**Checks.** `npm run build` · `npm run lint` · `npm run test:scores` · `npm run lint:reference`

Synthetic data only. Clinical values and CPTs marked `NEEDS-CLINICIAN` / `NEEDS-CODER` are
unsigned proposals — the engine routes around them and prints them as findings, never guesses.
