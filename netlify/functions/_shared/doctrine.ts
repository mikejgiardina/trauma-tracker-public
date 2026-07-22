// netlify/functions/_shared/doctrine.ts
// Single source of truth for the cross-cutting agent doctrine + the report
// disclaimer/attestation. Previously each function carried its own inline copy
// (debrief.ts had the canonical DOCTRINE; note.ts + claude.ts had divergent
// partial restatements). esbuild bundles this relative import into each
// function standalone — no runtime file read.
//
// Agent-SPECIFIC rules (extractor no-normal-range-hallucination, the
// Age/Sex/Weight rule) intentionally stay inline in claude.ts — only the
// cross-cutting doctrine lives here.

/** The shared judgment-seat doctrine. Verbatim from the (most complete)
 *  debrief.ts version — reconcile against this, never rewrite the clinical
 *  judgment it encodes. */
export const DOCTRINE = `Ground every assertion in the provided inputs and cite its T+MM:SS timestamp — no timestamp, no claim.
Never state a patient outcome, a diagnosis, or that care was substandard. Question, never verdict.
No letter grades, no scores out of 10, no numeric ratings — bands and counts only.
Never infer anyone's internal state; only what was said or done, verbatim-evidenced.
Roles, never names. Synthetic data only — no PHI. The tool presents; humans decide.
Return the fields defined by the response schema.`;

/** AGENT_LINEUP.md Agent 2 — required on every page. Verbatim. */
export const DISCLAIMER =
  'AI-GENERATED DRAFT. Not a medical record until reviewed and signed. Synthetic demo, no PHI.';

/** AGENT_LINEUP.md Agent 2 — required on every page. Verbatim. */
export const ATTESTATION =
  'DRAFT — AI-GENERATED. Not a medical record until reviewed and signed by the\n' +
  'responsible clinician. Generated from ambient capture. Synthetic demo — no PHI.\n\n' +
  'Signature: ______________________  Title: __________  Date/Time: ____________';
