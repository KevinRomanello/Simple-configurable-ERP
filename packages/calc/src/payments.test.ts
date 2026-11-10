import { describe, expect, it } from "vitest";
import { cashFlowSummary } from "./cashflow";
import { figures, line, snapshot } from "./fixtures";
import { gantt } from "./gantt";
import { computeLines } from "./lines";
import type { Snapshot } from "./snapshot";

// Payments of the register linked to a line (docs/registro-di-cassa.md, 5bis): with a BANK that comes
// from the register, a line with payments counts only what is still to pay, from its purchase date or,
// when that has passed, from the day after the BANK. A line without payments keeps the rule of before.

// BANK on 10 Nov 2026; line 1 is a team-fund purchase of 1000.00 net (22% VAT) dated 1 Oct (already past);
// line 2 is one of 500.00 net dated 15 Dec (to come); line 3 is 200.00 net dated 20 Oct, with no payments.
function scenario(payments: Snapshot["payments"], lateFrom: string | undefined = "2026-11-11"): Snapshot {
  return snapshot({
    projects: [{ id: 1, areaId: 1, name: "P", ownerName: null, position: 1 }],
    bank: { amountCents: 100_000, asOfDate: "2026-11-10" },
    lookups: { ...snapshot().lookups, settings: { ...snapshot().lookups.settings, bankCompare: { summary: "day", timeline: "day" } } },
    lines: [
      line(1, 1, null, figures(1, 1_000, { fundIds: [1], vatRate: 22, purchaseDate: "2026-10-01" })),
      line(2, 1, null, figures(1, 500, { fundIds: [1], vatRate: 22, purchaseDate: "2026-12-15" })),
      line(3, 1, null, figures(1, 200, { fundIds: [1], vatRate: 22, purchaseDate: "2026-10-20" })),
    ],
    payments,
    lateFrom: payments ? lateFrom : undefined,
  });
}

const net = (s: Snapshot) => cashFlowSummary(s, "actual").teamOutflowsCents - 0;

describe("what is still to pay", () => {
  it("is the whole team fund purchase for a line with no payments, and nothing changes without payments at all", () => {
    const calc = computeLines(scenario(undefined)).map((l) => [l.actual.paidCents, l.actual.teamFundDueCents, l.actual.cashDate]);
    expect(calc).toEqual([[0, 100_000, "2026-10-01"], [0, 50_000, "2026-12-15"], [0, 20_000, "2026-10-20"]]);
    expect(computeLines(scenario([])).map((l) => l.actual.teamFundDueCents)).toEqual([100_000, 50_000, 20_000]);
  });

  it("is what the payments have not paid yet; a line paid in full is nothing", () => {
    const lines = computeLines(scenario([{ lineId: 1, cents: 30_000 }, { lineId: 2, cents: 50_000 }]));
    expect(lines.map((l) => [l.actual.paidCents, l.actual.teamFundDueCents])).toEqual([[30_000, 70_000], [50_000, 0], [0, 20_000]]);
    expect(computeLines(scenario([{ lineId: 1, cents: 999_999 }]))[0]!.actual.teamFundDueCents).toBe(0); // never negative
  });

  it("leaves when it was bought, or the day after the BANK if that day has passed and the line is partly paid", () => {
    const lines = computeLines(scenario([{ lineId: 1, cents: 30_000 }, { lineId: 2, cents: 10_000 }]));
    expect(lines.map((l) => l.actual.cashDate)).toEqual(["2026-11-11", "2026-12-15", "2026-10-20"]);
  });

  it("only the ACTUAL phase has payments", () => {
    const estimate = computeLines(snapshot({ ...scenario([{ lineId: 1, cents: 30_000 }]), lines: [line(1, 1, figures(1, 1_000, { fundIds: [1], vatRate: 22, purchaseDate: "2026-12-01" }), null)] }))[0]!;
    expect(estimate.estimate).toMatchObject({ paidCents: 0, teamFundDueCents: 100_000, cashDate: "2026-12-01" });
  });
});

describe("CASH FLOW and the Gantt with payments", () => {
  // VAT of the three lines (22%): 220.00 + 110.00 + 44.00, due 16 Feb 2027 (purchases of Oct-Dec): counted by their date
  it("count a line with payments for what is left, and a line without for what they always did (past ones are already in the BANK)", () => {
    const before = cashFlowSummary(scenario([]), "actual");
    const after = cashFlowSummary(scenario([{ lineId: 1, cents: 30_000 }, { lineId: 2, cents: 50_000 }]), "actual");
    // line 1: 700.00 left, late, counts from tomorrow (+700.00 out; before it was past and ignored); line 2: paid, so -500.00 out
    expect(after.teamOutflowsCents - before.teamOutflowsCents).toBe(70_000 - 50_000);
    expect(net(scenario([]))).toBe(before.teamOutflowsCents);
  });

  it("put the part still to pay of a late line in the month after the BANK, in the Team's fund table of the Gantt", () => {
    const rows = gantt(scenario([{ lineId: 1, cents: 30_000 }]), "actual").teamFund.rows;
    const outflow = (month: string) => rows.find((r) => r.month === month)?.outflowAllCents ?? 0;
    expect(outflow("2026-11")).toBe(70_000);
    expect(outflow("2026-10")).toBe(0);
    expect(outflow("2026-12")).toBe(50_000 + 0); // line 2, with no payments, as before
  });

  it("without payments the Gantt and CASH FLOW are what they were: past lines are in the BANK", () => {
    const rows = gantt(scenario(undefined), "actual").teamFund.rows;
    expect(rows.find((r) => r.month === "2026-11")?.outflowAllCents ?? 0).toBe(0);
  });
});
