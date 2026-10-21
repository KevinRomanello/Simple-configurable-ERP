import { percentOf } from "./money";
import type { InflowInput, Snapshot } from "./snapshot";
import type { Phase } from "./types";
import { vatDeadline } from "./vat";

/** Money that reaches the bank in a phase. */
export type BankInflow = Pick<InflowInput, "sourceName" | "amountCents" | "inflowDate">;

/** The contracts of the sponsors whose money is paid into the bank, with the sponsor's name. */
function cashContracts(snapshot: Snapshot, phase: Phase): BankInflow[] {
  const names = new Map(snapshot.funds.filter((f) => f.mode === "cash").map((f) => [f.id, f.name]));
  return snapshot.contracts
    .filter((c) => c.phase === phase && names.has(c.fundId))
    .map((c) => ({ sourceName: names.get(c.fundId)!, amountCents: c.amountCents, inflowDate: c.inflowDate }));
}

/**
 * Everything that reaches the bank in a phase: the inflows typed in CASH FLOW plus the contracts
 * of cash sponsors, which count by themselves (they are not copied into the CASH FLOW table).
 */
export function bankInflows(snapshot: Snapshot, phase: Phase): BankInflow[] {
  return [...snapshot.inflows.filter((i) => i.phase === phase), ...cashContracts(snapshot, phase)];
}

export interface CashSponsorVat {
  /** The usual quarterly VAT deadline of the day the money came in. */
  dueDate: string;
  cents: number;
}

/**
 * The VAT the team owes on the money of cash sponsors: a fixed rate by law (the sponsorship is
 * invoiced), paid on the same quarterly deadlines as every other VAT. A contract without an inflow
 * date has no deadline yet and is left out.
 */
export function cashSponsorVat(snapshot: Snapshot, phase: Phase): CashSponsorVat[] {
  const { settings, vatRules } = snapshot.lookups;
  return cashContracts(snapshot, phase)
    .filter((c): c is BankInflow & { inflowDate: string } => c.inflowDate !== null)
    .map((c) => ({ dueDate: vatDeadline(c.inflowDate, vatRules), cents: percentOf(c.amountCents, settings.cashSponsorVatRate) }))
    .filter((v) => v.cents > 0);
}
