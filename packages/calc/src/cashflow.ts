import { isAfterBank } from "./bank";
import { bankInflows, cashSponsorVat } from "./cash";
import { fundSummary, inflowsByMonth, type MonthlyInflow } from "./funds";
import { computeLines } from "./lines";
import type { Snapshot } from "./snapshot";
import type { Phase } from "./types";

export interface CashFlowSummary {
  phase: Phase;
  /** BANK plus the inflows that come after it. */
  totalCashFlowCents: number;
  /** Purchases paid from the team fund (VAT excluded) plus the VAT the team pays (also on cash sponsors' money). */
  teamOutflowsCents: number;
  leftValueCents: number;
  /** Sum of the negative balances of the external funds: the team covers them. */
  shortfallCents: number;
  leftAfterCoverageCents: number;
}

/**
 * The CASH FLOW summary of one phase (rules: docs/regole-script-attuale.md, section 9).
 *
 *   total = BANK + inflows after the BANK date
 *   left  = total - (team-fund purchases without VAT + VAT paid by the team)
 *
 * When the BANK has a date, only purchases and VAT deadlines after it count.
 */
export function cashFlowSummary(snapshot: Snapshot, phase: Phase): CashFlowSummary {
  const { bank } = snapshot;
  const mode = snapshot.lookups.settings.bankCompare.summary;
  const bankDate = bank?.asOfDate ?? null;
  const counts = (date: string | null) => bankDate === null || isAfterBank(date, bankDate, mode);

  const countedInflows = bankInflows(snapshot, phase).filter((i) => counts(i.inflowDate));
  const totalCashFlowCents =
    (bank?.amountCents ?? 0) + countedInflows.reduce((sum, i) => sum + i.amountCents, 0);

  const lines = computeLines(snapshot).map((l) => l[phase]);
  const teamPurchases = lines
    .filter((p) => counts(p.purchaseDate))
    .reduce((sum, p) => sum + p.teamFundCents, 0);
  const teamVat =
    lines.filter((p) => p.teamVatCents > 0 && counts(p.vatDueDate)).reduce((sum, p) => sum + p.teamVatCents, 0) +
    cashSponsorVat(snapshot, phase).filter((v) => counts(v.dueDate)).reduce((sum, v) => sum + v.cents, 0);

  const teamOutflowsCents = teamPurchases + teamVat;
  const leftValueCents = totalCashFlowCents - teamOutflowsCents;
  const shortfallCents = fundSummary(snapshot, phase).reduce(
    (sum, row) => sum + Math.min(0, row.leftCents),
    0,
  );

  return {
    phase,
    totalCashFlowCents,
    teamOutflowsCents,
    leftValueCents,
    shortfallCents,
    leftAfterCoverageCents: leftValueCents + shortfallCents,
  };
}

/** The CASH FLOW monthly summary for one phase. */
export function cashFlowByMonth(snapshot: Snapshot, phase: Phase): MonthlyInflow[] {
  return inflowsByMonth(
    bankInflows(snapshot, phase).map((i) => ({ name: i.sourceName, amountCents: i.amountCents, date: i.inflowDate })),
  );
}
