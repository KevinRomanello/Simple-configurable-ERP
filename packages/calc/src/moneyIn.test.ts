import { describe, expect, it } from "vitest";
import { snapshot, sponsorFund, teamFund } from "./fixtures";
import { moneyIn } from "./moneyIn";

const season2026 = snapshot({
  funds: [teamFund, sponsorFund(2, { name: "Acme" }), sponsorFund(3, { name: "Beta" })],
  contracts: [
    { id: 1, fundId: 2, phase: "estimate", amountCents: 1_000_000, inflowDate: "2026-10-01" },
    { id: 2, fundId: 2, phase: "actual", amountCents: 800_000, inflowDate: "2027-02-01" },
    { id: 3, fundId: 3, phase: "estimate", amountCents: 300_000, inflowDate: null },
  ],
  inflows: [{ id: 1, phase: "actual", sourceName: "Gala dinner", amountCents: 250_000, inflowDate: "2026-12-12" }],
  bank: { amountCents: 560_000, asOfDate: "2026-10-15" },
});
const season2025 = snapshot({
  funds: [teamFund, sponsorFund(2, { name: "ACME" })],
  contracts: [{ id: 1, fundId: 2, phase: "actual", amountCents: 500_000, inflowDate: "2026-03-01" }],
  inflows: [],
  bank: { amountCents: 100_000, asOfDate: "2025-10-01" },
});

describe("moneyIn", () => {
  it("for a season: the BANK in both phases, then each sponsor, then each inflow", () => {
    const { rows, total } = moneyIn([season2026]);
    expect(rows.map((r) => [r.kind, r.label, r.estimateCents, r.actualCents])).toEqual([
      ["bank", "BANK", 560_000, 560_000],
      ["sponsor", "Acme", 1_000_000, 800_000],
      ["sponsor", "Beta", 300_000, 0],
      ["inflow", "Gala dinner", 0, 250_000],
    ]);
    expect(rows[0]!.asOf).toBe("2026-10-15");
    expect(total).toEqual({ estimate: 1_860_000, actual: 1_610_000 });
  });

  it("for a calendar year: what is dated in it, of every season, the same sponsor in one row, no BANK and nothing without a date", () => {
    const { rows, total } = moneyIn([season2025, season2026], "2026");
    expect(rows.map((r) => [r.label, r.estimateCents, r.actualCents])).toEqual([
      ["ACME", 1_000_000, 500_000],
      ["Gala dinner", 0, 250_000],
    ]);
    expect(total).toEqual({ estimate: 1_000_000, actual: 750_000 });
  });
});
