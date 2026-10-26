import { describe, expect, it } from "vitest";
import { cashFlowByMonth, cashFlowSummary } from "./cashflow";
import { figures, line, settings, snapshot, sponsorFund, teamFund } from "./fixtures";
import type { Snapshot } from "./snapshot";

// docs/regole-script-attuale.md, section 17: BANK 5 000.00 on 15 Nov 2026; inflows of 2 000.00
// on 10 Nov and 1 000.00 on 5 Dec; one purchase from the team fund on 20 Nov with outflow
// 600.00, of which 100.00 VAT (due 16 Feb 2027). The inflows owe 11% VAT, paid on 1 Jan 2027:
// 220.00 on the first, 110.00 on the second.
function scenario(overrides: Partial<Snapshot> = {}): Snapshot {
  return snapshot({
    projects: [{ id: 1, areaId: 1, name: "P", ownerName: null, position: 1 }],
    bank: { amountCents: 500_000, asOfDate: "2026-11-15" },
    inflows: [
      { id: 1, phase: "estimate", sourceName: "X", amountCents: 200_000, inflowDate: "2026-11-10" },
      { id: 2, phase: "estimate", sourceName: "Y", amountCents: 100_000, inflowDate: "2026-12-05" },
    ],
    lines: [line(1, 1, figures(1, 500, { fundIds: [1], vatRate: 20, purchaseDate: "2026-11-20" }))],
    ...overrides,
  });
}

describe("cashFlowSummary", () => {
  it("counts only inflows after the BANK date and charges the team its purchase and VAT", () => {
    expect(cashFlowSummary(scenario(), "estimate")).toMatchObject({
      totalCashFlowCents: 600_000,
      teamOutflowsCents: 50_000 + 10_000 + 22_000 + 11_000, // the purchase, its VAT, the VAT on both inflows
      leftValueCents: 507_000,
    });
  });

  it("without a BANK it sums all inflows and every team outflow", () => {
    const s = scenario({ bank: null });
    expect(cashFlowSummary(s, "estimate")).toMatchObject({
      totalCashFlowCents: 300_000,
      leftValueCents: 207_000,
    });
  });

  it("a BANK without a date is added to all inflows and every outflow counts", () => {
    const s = scenario({ bank: { amountCents: 500_000, asOfDate: null } });
    expect(cashFlowSummary(s, "estimate")).toMatchObject({
      totalCashFlowCents: 800_000,
      leftValueCents: 707_000,
    });
  });

  it("ignores purchases made before the BANK date but still charges their later VAT", () => {
    const s = scenario({
      lines: [line(1, 1, figures(1, 500, { fundIds: [1], vatRate: 20, purchaseDate: "2026-11-10" }))],
    });
    // the 500.00 purchase is already in the BANK; left: its 100.00 VAT (due 16 Feb 2027) and the
    // VAT on the inflows (1 Jan 2027), which is also after the BANK date
    expect(cashFlowSummary(s, "estimate").teamOutflowsCents).toBe(10_000 + 22_000 + 11_000);
  });

  it("reads the actual phase from the actual figures only", () => {
    expect(cashFlowSummary(scenario(), "actual")).toMatchObject({
      totalCashFlowCents: 500_000,
      teamOutflowsCents: 0,
    });
  });

  it("open question Q2: comparing by month leaves out the purchase made in the BANK's month", () => {
    const s = scenario();
    s.lookups = {
      ...s.lookups,
      settings: { ...settings, bankCompare: { summary: "month", timeline: "month" } },
    };
    expect(cashFlowSummary(s, "estimate")).toMatchObject({
      teamOutflowsCents: 10_000 + 22_000 + 11_000, // only the VAT: of the purchase (February) and of the inflows (January)
      leftValueCents: 557_000,
    });
  });

  it("adds the shortfall of overspent funds back to the left value", () => {
    const s = scenario({
      funds: [
        teamFund,
        sponsorFund(2, { name: "Sponsor", vatRate: 0 }),
      ],
      contracts: [{ id: 1, fundId: 2, phase: "estimate", amountCents: 10_000, inflowDate: null }],
      lines: [
        line(1, 1, figures(1, 500, { fundIds: [1], vatRate: 20, purchaseDate: "2026-11-20" })),
        line(2, 1, figures(1, 300, { fundIds: [2] })), // outflow 300.00 on a 100.00 contract
      ],
    });
    const summary = cashFlowSummary(s, "estimate");
    expect(summary.shortfallCents).toBe(-20_000);
    expect(summary.leftAfterCoverageCents).toBe(summary.leftValueCents - 20_000);
  });
});

describe("cashFlowByMonth", () => {
  it("summarises the inflows of the phase per month", () => {
    expect(cashFlowByMonth(scenario(), "estimate")).toEqual([
      { month: "2026-11", totalCents: 200_000, names: ["X"] },
      { month: "2026-12", totalCents: 100_000, names: ["Y"] },
    ]);
  });
});
