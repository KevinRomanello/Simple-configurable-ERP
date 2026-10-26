import { percentOf } from "./money";
import type { InflowInput, Snapshot } from "./snapshot";
import type { Phase } from "./types";
import { firstDayOfNextQuarter } from "./vat";

/** Everything that reaches the bank in a phase: the inflows typed in CASH FLOW. */
export function bankInflows(snapshot: Snapshot, phase: Phase): InflowInput[] {
  return snapshot.inflows.filter((i) => i.phase === phase);
}

export interface InflowVat {
  /** The first day of the quarter after the inflow. */
  dueDate: string;
  cents: number;
}

/**
 * The VAT the team owes on its inflows: money that comes in is sponsorship, which is invoiced, at
 * a fixed rate by law. It is paid on the first day of the quarter after the inflow. An inflow
 * without a date has no day to pay on yet and is left out.
 */
export function inflowVat(snapshot: Snapshot, phase: Phase): InflowVat[] {
  const rate = snapshot.lookups.settings.inflowVatRate;
  return bankInflows(snapshot, phase)
    .filter((i): i is InflowInput & { inflowDate: string } => i.inflowDate !== null)
    .map((i) => ({ dueDate: firstDayOfNextQuarter(i.inflowDate), cents: percentOf(i.amountCents, rate) }))
    .filter((v) => v.cents > 0);
}
