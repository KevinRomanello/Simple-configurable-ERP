import { monthKey, monthRange, monthSpan } from "./dates";
import { computeLines } from "./lines";
import type { Snapshot } from "./snapshot";
import type { Phase } from "./types";

export interface FundSummaryRow {
  fundId: number;
  name: string;
  /** What the fund is worth in the phase; null for a sponsor with no sum of money (no ceiling, goods). */
  totalContractCents: number | null;
  /** Outflow of the lines paid from this fund, in this phase. */
  outflowCents: number;
  vatCents: number;
  /** What is left of the contracts. Negative means the fund is overspent. Null for a sponsor with no sum of money. */
  leftCents: number | null;
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.toLowerCase().localeCompare(b.name.toLowerCase());

/**
 * The CASH FROM summary: one row per sponsor that has a contract in the phase, and in both phases one per sponsor that
 * has no sum of money (a fund with no ceiling, goods with or without VAT): the row says how much is spent (EXPECTED:
 * how much is expected to be spent) with them, and has no total and no residue. A line paid by several funds counts for
 * each of them only with its part.
 * left = contracts - outflow (the fund covers the VAT of its purchases).
 * What goods are worth is the net of the lines they pay (plus the VAT of the counter-invoice, which the team pays): the
 * share of a gift carries only that VAT.
 */
export function fundSummary(snapshot: Snapshot, phase: Phase): FundSummaryRow[] {
  const lines = computeLines(snapshot);

  return snapshot.funds
    .filter((fund) => fund.kind === "external")
    .map((fund) => {
      const noSum = fund.unlimited === true || fund.type !== "fund";
      const contracts = snapshot.contracts.filter((c) => c.fundId === fund.id && c.phase === phase);
      if (contracts.length === 0 && !noSum) return null;

      const totalContractCents = contracts.reduce((sum, c) => sum + c.amountCents, 0);
      const own = lines.flatMap((l) => l[phase].shares.filter((share) => share.fundId === fund.id).map((share) => ({ share, amounts: l[phase].amounts })));
      const outflowCents = own.reduce((sum, { share, amounts }) => sum + (fund.type === "fund" ? share.netCents : amounts.netCents) + share.vatCents, 0);
      const vatCents = own.reduce((sum, { share }) => sum + share.vatCents, 0);

      return {
        fundId: fund.id,
        name: fund.name,
        totalContractCents: noSum ? null : totalContractCents,
        outflowCents,
        vatCents,
        leftCents: noSum ? null : totalContractCents - outflowCents,
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
