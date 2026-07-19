/**
 * Typed loader for the five JSON rulebooks.
 *
 * The JSON is the rulebook; this module is the only place that casts the raw
 * `resolveJsonModule` shapes onto the frozen `src/types.ts` contract, so every
 * other engine module reads typed data and never re-parses.
 */

import type {
  ActivationLattice,
  ChargeItem,
  MeasureResult,
  ObligationCatalog,
  ObligationDef,
} from '../types.ts';

import obligationsRaw from '../data/obligations.json';
import chargesRaw from '../data/charges.json';
import measuresRaw from '../data/accreditation_measures.json';
import latticeRaw from '../data/activation_lattice.json';

export const catalog = obligationsRaw as unknown as ObligationCatalog;
export const obligations: ObligationDef[] = catalog.obligations;

export const charges: ChargeItem[] = (chargesRaw as { charge_items: ChargeItem[] }).charge_items;

/** Raw published measure rows (superset of the runtime MeasureResult view). */
export interface MeasureDef {
  id: string;
  name: string;
  standard?: string;
  target_min?: number;
  type?: string;
  case_triggered?: boolean;
  regulatory?: boolean;
  reimbursement_link?: string;
  confirmation_required?: string[];
  [k: string]: unknown;
}
export const measures: MeasureDef[] = (measuresRaw as { measures: MeasureDef[] }).measures;

export const lattice = latticeRaw as unknown as ActivationLattice;

/* ── lookups ── */

const obligationById = new Map(obligations.map((o) => [o.id, o]));
export const getObligation = (id: string): ObligationDef | undefined => obligationById.get(id);

const chargeByCode = new Map(charges.map((c) => [c.code, c]));
export const getCharge = (code: string): ChargeItem | undefined => chargeByCode.get(code);

const measureById = new Map(measures.map((m) => [m.id, m]));
export const getMeasure = (id: string): MeasureDef | undefined => measureById.get(id);

/** A convenience the report uses for empty measures with no data yet. */
export const measureResultStub = (m: MeasureDef): MeasureResult => ({
  id: m.id,
  name: m.name,
  status: 'not_applicable',
  targetMin: m.target_min,
});
