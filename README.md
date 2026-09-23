# Trauma Tracker

**A real-time ED trauma registrar.** While a trauma resuscitation is happening, it listens to the room and does the documentation, quality-measure, and billing work the team can't touch while they're saving a life — then generates the deliverable at disposition.

**Synthetic data only. No PHI, by design.**

Live demo: https://traumatrackerv2.netlify.app (canned mode runs with no keys).

## What it does

From a live — or replayed, or injected — trauma-bay transcript, specialized agents **decide and produce**, they don't just display:

- **Extract** — pull spoken values and interventions as they're said (GCS, HR/BP, activation, IV access, type & cross, intubation), timestamped.
- **Score** — Shock Index, RTS, GCS computed live as the patient changes (deterministic, no model).
- **Charge integrity** — a charge fires only when the documentation that code requires is present (e.g. intubation confirmed by EtCO₂ + bilateral breath sounds).
- **Core-measure clocks & activation fee** — watches accreditation windows and makes the trauma-activation determination against criteria, with the evidence cited.
- **Nurse's note** — a signable narrative, composed one sentence per event *as the resus runs* (no big end-of-case call).
- **Hot debrief & emotional-impact review** — post-report agents that surface **only** what's genuinely worth passing on (a routine case returns "nothing to flag").

The deliverable is a multi-page report: nursing narrative, RCM charge/compliance report, activation determination, and the debrief / exposure review. Unresolved prompts ride the record to the report as documented gaps.

## Capture sources

- **Canned** — a bundled scripted case; plays with synced demo audio, zero keys, deterministic.
- **Live mic** — `getUserMedia` → server-side STT → extractor.
- **File** — upload an audio file → same STT path.
- **Transcript** — inject a pre-written, timestamped dialogue straight into the extractor (no audio, no STT). Author a case as text and run it through the real product.

## Architecture

- **Frontend** — React 19 + Vite + Tailwind. Decomposed panels (scores, charges, measures, activation, prompt surface, transcript) driven by the deterministic engine.
- **Engine** (`src/engine/`) — the deterministic core: an obligations ledger, scores, clocks, charge/CPT mapping, and the activation lattice. No model; pure functions.
- **Capture** (`src/capture/`) — the canned / live-mic / file / transcript sources plus the extractor client. The extractor is *windowed*: it sends only the new transcript window and the already-captured items, and the model emits only new items, so tokens stay bounded across a case.
- **Backend** (`netlify/functions/`) — serverless functions that hold the API keys **server-side** (the browser never sees them) and route every model call through one `callAgent` chokepoint (Anthropic structured outputs, thinking disabled, retries). Functions: `claude` (extractor), `note` (per-sentence nurse's note), `debrief` (hot debrief + exposure), `stt` (Deepgram).

## Run it

```bash
npm install
npm run dev          # canned mode works with no keys
```

The live agent paths need keys, set as **Netlify environment variables** (never in the repo):
`ANTHROPIC_API_KEY`, `DEEPGRAM_API_KEY`, and `STT_VENDOR=deepgram`.

## Lineage

Built at the Abridge × Anthropic × Lightspeed agentic-AI hackathon (July 18, 2026, Pacific time) in a single build window. The submission is a separate, public, archived repo, [ttprod](https://github.com/mikejgiardina/ttprod), frozen exactly as submitted; every commit in it falls inside the window. One build session produced two working versions of the app: the submission video shows one, and this repo is the other, the version demoed to the judge, first committed the evening of the event. Four days later the features that existed only in the other version were merged in here, the model-call plumbing was reworked (structured outputs, a single-source agent doctrine, per-window extraction), and a set of fixes and refinements followed. That is the only post-event work on the application itself; the commit history shows each instant.
