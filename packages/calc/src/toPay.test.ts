import { describe, expect, it } from "vitest";
import { figures, line, snapshot, sponsorFund, teamFund } from "./fixtures";
import { computeLines } from "./lines";
import type { Figures, FundInput, Snapshot } from "./snapshot";
import { toPayLines } from "./toPay";

// TO PAY: what the team still has to pay of the lines bought (ACTUAL): the net out of its fund and the VAT.

const TODAY = "2026-11-10";

function build(lines: Figures[], payments: Snapshot["payments"] = [], funds: FundInput[] = []): Snapshot {
  return snapshot({
    projects: [{ id: 1, areaId: 1, name: "P", ownerName: null, position: 1 }],
    funds: [teamFund, ...funds],
    lines: lines.map((f, i) => line(i + 1, 1, null, f)),
    payments,
  });
}
const list = (s: Snapshot) => toPayLines(computeLines(s), TODAY);

describe("the lines to pay", () => {
  it("lists a line bought and not paid with what the team owes: the net and the VAT", () => {
    const [row] = list(build([figures(1, 100, { fundIds: [1], vatRate: 22, purchaseDate: "2026-11-01" })]));
    expect(row).toMatchObject({ lineId: 1, teamFundCents: 10_000, teamVatCents: 2_200, paidCents: 0, dueCents: 12_200, status: "due", daysWaiting: 9 });
  });

  it("says planned for a date to come, and has none of the lines a sponsor pays (no money leaves the team)", () => {
    const rows = list(build([
      figures(1, 100, { fundIds: [1], vatRate: 22, purchaseDate: "2026-12-20" }),
      figures(1, 100, { fundIds: [2], vatRate: 22, purchaseDate: "2026-11-01" }),
      figures(1, 100, { vatRate: 22, purchaseDate: "2026-11-01" }), // nobody pays it yet
    ], [], [sponsorFund(2, { vatRate: 22 })]));
    expect(rows.map((r) => [r.lineId, r.status])).toEqual([[1, "planned"]]);
  });

  it("a payment makes it partial, with the net first and then the VAT; paid in full it is gone", () => {
    const part = list(build([figures(1, 100, { fundIds: [1], vatRate: 22, purchaseDate: "2026-11-01" })], [{ lineId: 1, cents: 10_000 }]))[0]!;
    expect(part).toMatchObject({ status: "partial", paidCents: 10_000, unpaidFundCents: 0, unpaidVatCents: 2_200, dueCents: 2_200 });
    expect(part.vatDueDate).not.toBeNull();
    expect(list(build([figures(1, 100, { fundIds: [1], vatRate: 22, purchaseDate: "2026-11-01" })], [{ lineId: 1, cents: 12_200 }]))).toEqual([]);
  });

  it("a payment above what the team owes is listed as over, with the excess", () => {
    const [row] = list(build([figures(1, 100, { fundIds: [1], vatRate: 22, purchaseDate: "2026-11-01" })], [{ lineId: 1, cents: 15_000 }]));
    expect(row).toMatchObject({ status: "over", dueCents: 0, overpaidCents: 2_800 });
  });

  it("a gift with a counter-invoice leaves only the VAT to the team; a line without a date or a quantity is listed without a date", () => {
    const rows = list(build([
      figures(1, 100, { fundIds: [2], purchaseDate: "2026-11-01" }),
      figures(1, 50, { fundIds: [1], vatRate: 22 }),
    ], [], [sponsorFund(2, { type: "gift_vat", vatRate: 11 })]));
    expect(rows.find((r) => r.lineId === 1)).toMatchObject({ teamFundCents: 0, teamVatCents: 1_100, dueCents: 1_100 });
    expect(rows.find((r) => r.lineId === 2)).toMatchObject({ purchaseDate: null, daysWaiting: null, status: "due" });
  });

  it("goes from the oldest purchase to the newest, lines without a date last", () => {
    const rows = list(build([
      figures(1, 10, { fundIds: [1], vatRate: 22, purchaseDate: "2026-11-05" }),
      figures(1, 10, { fundIds: [1], vatRate: 22 }),
      figures(1, 10, { fundIds: [1], vatRate: 22, purchaseDate: "2026-10-01" }),
    ]));
    expect(rows.map((r) => r.lineId)).toEqual([3, 1, 2]);
  });
});
