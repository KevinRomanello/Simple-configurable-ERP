import { monthKey, monthRange, monthSpan } from "./dates";
import { computeLines } from "./lines";
import type { Snapshot } from "./snapshot";
import type { Phase } from "./types";

export interface FundSummaryRow {
  fundId: number;
  name: string;
  totalContractCents: number;
  /** Outflow of the lines paid from this fund, in this phase. */
  outflowCents: number;
  vatCents: number;
  /** What is left of the contracts. Negative means the fund is overspent. */
  leftCents: number;
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.toLowerCase().localeCompare(b.name.toLowerCase());

/**
 * The CASH FROM summary: one row per sponsor that has a contract in the phase. A line paid by
 * several funds counts for each of them only with its part.
 * left = contracts - outflow (the fund covers the VAT of its purchases).
 */
export function fundSummary(snapshot: Snapshot, phase: Phase): FundSummaryRow[] {
  const lines = computeLines(snapshot);

  return snapshot.funds
    .filter((fund) => fund.kind === "external")
    .map((fund) => {
      const contracts = snapshot.contracts.filter((c) => c.fundId === fund.id && c.phase === phase);
      if (contracts.length === 0) return null;

      const totalContractCents = contracts.reduce((sum, c) => sum + c.amountCents, 0);
      const own = lines.flatMap((l) => l[phase].shares).filter((share) => share.fundId === fund.id);
      const outflowCents = own.reduce((sum, s) => sum + s.netCents + s.vatCents, 0);
      const vatCents = own.reduce((sum, s) => sum + s.vatCents, 0);

      return {
        fundId: fund.id,
        name: fund.name,
        totalContractCents,
        outflowCents,
        vatCents,
        leftCents: totalContractCents - outflowCents,
      };
    })
    .filter((row): row is FundSummaryRow => row !== null)
    .sort(byName);
}

export interface InflowRow {
  name: string;
  amountCents: number;
  date: string | null;
}

export interface MonthlyInflow {
  month: string;
  totalCents: number;
  /** Who pays in that month (only rows with an amount above zero). */
  names: string[];
}

/**
 * The "DATE SUMMARY" under CASH FROM and CASH FLOW: money per month, over a continuous run of
 * months from the first to the last dated row.
 */
export function inflowsByMonth(rows: InflowRow[]): MonthlyInflow[] {
  const dated = rows.filter((r): r is InflowRow & { date: string } => r.date !== null);
  const span = monthSpan(dated.map((r) => monthKey(r.date)));
  if (!span) return [];

  return monthRange(span[0], span[1]).map((month) => {
    const inMonth = dated.filter((r) => monthKey(r.date) === month && r.amountCents > 0);
    return {
      month,
      totalCents: inMonth.reduce((sum, r) => sum + r.amountCents, 0),
      names: [...new Set(inMonth.map((r) => r.name))].sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase()),
      ),
    };
  });
}

/** The CASH FROM monthly summary for one phase. */
export function fundContractsByMonth(snapshot: Snapshot, phase: Phase): MonthlyInflow[] {
  const names = new Map(snapshot.funds.map((f) => [f.id, f.name]));
  return inflowsByMonth(
    snapshot.contracts
      .filter((c) => c.phase === phase)
      .map((c) => ({
        name: names.get(c.fundId) ?? `Fund ${c.fundId}`,
        amountCents: c.amountCents,
        date: c.inflowDate,
      })),
  );
}
