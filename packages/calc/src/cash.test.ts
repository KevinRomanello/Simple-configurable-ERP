import { describe, expect, it } from "vitest";
import { bankInflows, cashSponsorVat } from "./cash";
import { cashFlowByMonth, cashFlowSummary } from "./cashflow";
import { fundContractsByMonth, fundSummary } from "./funds";
import { figures, line, snapshot, sponsorFund, teamFund } from "./fixtures";
import { gantt } from "./gantt";
import type { Snapshot } from "./snapshot";

// A sponsor whose money is paid into the bank (mode "cash"): the contract counts as an inflow of
// the team by itself, and the team owes a fixed 11% VAT on it on the usual quarterly deadline.
// BANK 5 000.00 on 15 Nov 2026; the sponsor pays 1 000.00 on 10 Dec 2026 -> VAT 110.00 due
// 16 Feb 2027 (the deadline of October-December).
function scenario(overrides: Partial<Snapshot> = {}): Snapshot {
  return snapshot({
    projects: [{ id: 1, areaId: 1, name: "P", ownerName: null, position: 1 }],
    bank: { amountCents: 500_000, asOfDate: "2026-11-15" },
    funds: [teamFund, sponsorFund(2, { name: "Cash sponsor", mode: "cash" })],
    contracts: [{ id: 1, fundId: 2, phase: "estimate", amountCents: 100_000, inflowDate: "2026-12-10" }],
    inflows: [{ id: 1, phase: "estimate", sourceName: "Typed", amountCents: 50_000, inflowDate: "2026-12-05" }],
    ...overrides,
  });
}

describe("cash sponsors", () => {
  it("their contracts reach the bank together with the typed inflows", () => {
    expect(bankInflows(scenario(), "estimate").map((i) => [i.sourceName, i.amountCents])).toEqual([
      ["Typed", 50_000],
      ["Cash sponsor", 100_000],
    ]);
    expect(bankInflows(scenario(), "actual")).toEqual([]);
  });

  it("owe 11% VAT on the deadline of the day the money came in", () => {
    expect(cashSponsorVat(scenario(), "estimate")).toEqual([{ dueDate: "2027-02-16", cents: 11_000 }]);
  });

  it("a contract without a date has no deadline yet", () => {
    const s = scenario({ contracts: [{ id: 1, fundId: 2, phase: "estimate", amountCents: 100_000, inflowDate: null }] });
    expect(cashSponsorVat(s, "estimate")).toEqual([]);
  });

  it("add to the total cash flow and cost the team the VAT", () => {
    expect(cashFlowSummary(scenario(), "estimate")).toMatchObject({
      totalCashFlowCents: 500_000 + 50_000 + 100_000,
      teamOutflowsCents: 11_000,
      leftValueCents: 639_000,
    });
  });

  it("show in the monthly summary of CASH FLOW", () => {
    expect(cashFlowByMonth(scenario(), "estimate")).toEqual([
      { month: "2026-12", totalCents: 150_000, names: ["Cash sponsor", "Typed"] },
    ]);
  });

  it("are in the Team's fund table: the inflow in its month, the VAT on its deadline", () => {
    const { months, teamFund: table } = gantt(scenario(), "estimate");
    expect(months).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(table.rows.map((r) => [r.inflowCents, r.outflowVatCents, r.finalCents])).toEqual([
      [500_000, 0, 500_000], // the BANK balance
      [50_000 + 100_000, 0, 650_000],
      [0, 0, 650_000],
      [0, 11_000, 639_000],
    ]);
  });

  it("are not a fund: no balance to spend, but still in the monthly inflows of CASH FROM", () => {
    expect(fundSummary(scenario(), "estimate")).toEqual([]);
    expect(fundContractsByMonth(scenario(), "estimate")).toEqual([
      { month: "2026-12", totalCents: 100_000, names: ["Cash sponsor"] },
    ]);
  });

  it("do not touch the lines", () => {
    const s = scenario({ lines: [line(1, 1, figures(1, 100, { fundIds: [1] }))] });
    expect(cashFlowSummary(s, "actual")).toMatchObject({ totalCashFlowCents: 500_000, teamOutflowsCents: 0 });
  });
});
