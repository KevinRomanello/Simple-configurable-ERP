import { describe, expect, it } from "vitest";
import { bankInflows, inflowVat } from "./cash";
import { cashFlowByMonth, cashFlowSummary } from "./cashflow";
import { figures, line, snapshot, teamFund } from "./fixtures";
import { gantt } from "./gantt";
import type { Snapshot } from "./snapshot";

// The money that comes in is sponsorship, which is invoiced: the team owes a fixed 11% VAT on every
// inflow, paid on the first day of the quarter after the day the money came in.
// BANK 5 000.00 on 15 Nov 2026; 500.00 comes in on 5 Dec and 1 000.00 on 10 Dec 2026 -> VAT 55.00
// and 110.00, both paid on 1 Jan 2027.
function scenario(overrides: Partial<Snapshot> = {}): Snapshot {
  return snapshot({
    projects: [{ id: 1, areaId: 1, name: "P", ownerName: null, position: 1 }],
    bank: { amountCents: 500_000, asOfDate: "2026-11-15" },
    funds: [teamFund],
    inflows: [
      { id: 1, phase: "estimate", sourceName: "First", amountCents: 50_000, inflowDate: "2026-12-05" },
      { id: 2, phase: "estimate", sourceName: "Second", amountCents: 100_000, inflowDate: "2026-12-10" },
    ],
    ...overrides,
  });
}

describe("inflows", () => {
  it("are what reaches the bank in their phase", () => {
    expect(bankInflows(scenario(), "estimate").map((i) => [i.sourceName, i.amountCents])).toEqual([
      ["First", 50_000],
      ["Second", 100_000],
    ]);
    expect(bankInflows(scenario(), "actual")).toEqual([]);
  });

  it("owe 11% VAT, paid on the first day of the quarter after the day the money came in", () => {
    expect(inflowVat(scenario(), "estimate")).toEqual([
      { dueDate: "2027-01-01", cents: 5_500 },
      { dueDate: "2027-01-01", cents: 11_000 },
    ]);
  });

  it("an inflow on the last day of a quarter pays on the next day; one on the first day, a quarter later", () => {
    const s = scenario({
      inflows: [
        { id: 1, phase: "estimate", sourceName: "A", amountCents: 10_000, inflowDate: "2026-12-31" },
        { id: 2, phase: "estimate", sourceName: "B", amountCents: 10_000, inflowDate: "2027-04-01" },
      ],
    });
    expect(inflowVat(s, "estimate").map((v) => v.dueDate)).toEqual(["2027-01-01", "2027-07-01"]);
  });

  it("without a date have no day to pay the VAT on yet", () => {
    const s = scenario({ inflows: [{ id: 1, phase: "estimate", sourceName: "A", amountCents: 100_000, inflowDate: null }] });
    expect(inflowVat(s, "estimate")).toEqual([]);
  });

  it("add to the total cash flow and cost the team the VAT", () => {
    expect(cashFlowSummary(scenario(), "estimate")).toMatchObject({
      totalCashFlowCents: 500_000 + 50_000 + 100_000,
      teamOutflowsCents: 16_500,
      leftValueCents: 633_500,
    });
  });

  it("show in the monthly summary of CASH FLOW", () => {
    expect(cashFlowByMonth(scenario(), "estimate")).toEqual([
      { month: "2026-12", totalCents: 150_000, names: ["First", "Second"] },
    ]);
  });

  it("are in the Team's fund table: the inflow in its month, the VAT on its day", () => {
    const { months, teamFund: table } = gantt(scenario(), "estimate");
    expect(months).toEqual(["2026-11", "2026-12", "2027-01"]);
    expect(table.rows.map((r) => [r.inflowCents, r.outflowVatCents, r.finalCents])).toEqual([
      [500_000, 0, 500_000], // the BANK balance
      [50_000 + 100_000, 0, 650_000],
      [0, 16_500, 633_500],
    ]);
  });

  it("do not touch the lines", () => {
    const s = scenario({ inflows: [], lines: [line(1, 1, figures(1, 100, { fundIds: [1] }))] });
    expect(cashFlowSummary(s, "actual")).toMatchObject({ totalCashFlowCents: 500_000, teamOutflowsCents: 0 });
  });
});
