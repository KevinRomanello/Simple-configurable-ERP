import { describe, expect, it } from "vitest";
import { fundSummary } from "./funds";
import { figures, line, snapshot, sponsorFund, teamFund } from "./fixtures";
import { computeLines } from "./lines";
import type { Figures, FundInput } from "./snapshot";

// The sponsors as a black box (docs/sponsor-e-fondi.md): the fund chosen on a line decides the
// sponsor discount, the VAT rate, who pays the VAT and what is drawn from each fund.

const contract = (id: number, fundId: number, euros: number) => ({
  id,
  fundId,
  phase: "estimate" as const,
  amountCents: euros * 100,
  inflowDate: null,
});

/** Lines in the order given, in one project; every line is 1 unit at the given net price. */
function build(funds: FundInput[], contracts: ReturnType<typeof contract>[], lines: Figures[]) {
  return snapshot({
    projects: [{ id: 1, areaId: 1, name: "P", ownerName: null, position: 1 }],
    funds: [teamFund, ...funds],
    contracts,
    lines: lines.map((f, index) => line(index + 1, 1, f)),
  });
}
const estimates = (s: ReturnType<typeof build>) => computeLines(s).map((l) => l.estimate);

describe("gifts", () => {
  const gift = sponsorFund(2, { type: "gift", vatRate: 0 });
  const barter = sponsorFund(3, { type: "gift_vat", vatRate: 11 });

  it("a gift covers the whole net and owes no VAT", () => {
    const [p] = estimates(build([gift], [], [figures(1, 1000, { fundIds: [2] })]));
    expect(p!.amounts).toMatchObject({ netCents: 100_000, sponsorCents: 100_000, vatCents: 0, outflowCents: 0, complete: true });
    expect(p!.teamVatCents).toBe(0);
  });

  it("a gift with a counter-invoice leaves the VAT of the whole net to the team, at the sponsor's rate", () => {
    const [p] = estimates(build([barter], [], [figures(1, 1000, { fundIds: [3], purchaseDate: "2026-11-10" })]));
    expect(p!.amounts).toMatchObject({ sponsorCents: 100_000, vatCents: 11_000, outflowCents: 11_000 });
    expect(p!.teamVatCents).toBe(11_000);
    expect(p!.vatDueDate).toBe("2027-02-16");
  });

  it("the team pays that VAT even if the sponsor is marked as paying VAT", () => {
    const paying = sponsorFund(3, { type: "gift_vat", vatRate: 11, paysVat: true });
    const [p] = estimates(build([paying], [], [figures(1, 1000, { fundIds: [3] })]));
    expect(p!.teamVatCents).toBe(11_000);
  });

  it("a gift needs no contract and is never short", () => {
    const [p] = estimates(build([gift], [], [figures(1, 1000, { fundIds: [2] })]));
    expect(p!.shortCents).toBe(0);
    expect(fundSummary(build([gift], [], []), "estimate")).toEqual([]);
  });
});

describe("a sponsor's fund", () => {
  it("brings its own VAT rate, whatever was typed on the line", () => {
    const fund = sponsorFund(2, { vatRate: 11 });
    const [p] = estimates(build([fund], [contract(1, 2, 5000)], [figures(1, 1000, { fundIds: [2], vatRate: 22 })]));
    expect(p!.amounts.vatCents).toBe(11_000);
  });

  it("is complete as soon as it is chosen: the sponsor type is not asked any more", () => {
    const fund = sponsorFund(2);
    const [p] = estimates(build([fund], [contract(1, 2, 5000)], [figures(1, 1000, { fundIds: [2], sponsorType: null })]));
    expect(p!.amounts).toMatchObject({ complete: true, sponsorCents: 0, outflowCents: 122_000 });
  });

  it("the team pays the VAT unless the fund covers it", () => {
    const keeps = sponsorFund(2);
    const covers = sponsorFund(3, { paysVat: true });
    const s = build([keeps, covers], [contract(1, 2, 5000), contract(2, 3, 5000)], [
      figures(1, 1000, { fundIds: [2] }),
      figures(1, 1000, { fundIds: [3] }),
    ]);
    const [a, b] = estimates(s);
    expect([a!.teamVatCents, b!.teamVatCents]).toEqual([22_000, 0]);
    expect(a!.shares[0]!.drawnCents).toBe(100_000); // the net only
    expect(b!.shares[0]!.drawnCents).toBe(122_000); // the net and its VAT
  });

  it("a partial sponsor discount typed in an imported sheet is kept", () => {
    const fund = sponsorFund(2);
    const f = figures(1, 1000, { fundIds: [2], sponsorType: "partial", sponsorValueCents: 40_000 });
    const [p] = estimates(build([fund], [contract(1, 2, 5000)], [f]));
    expect(p!.amounts).toMatchObject({ sponsorCents: 40_000, vatCents: 13_200, outflowCents: 73_200 });
    expect(p!.shares[0]!.netCents).toBe(60_000);
  });
});

describe("funds that pay together", () => {
  const a = sponsorFund(2, { name: "A", group: "g" });
  const b = sponsorFund(3, { name: "B", group: "g", vatRate: 11 });

  it("the first fund pays up to what it has left and the next one pays the rest", () => {
    const s = build([a, b], [contract(1, 2, 1000), contract(2, 3, 5000)], [figures(1, 1500, { fundIds: [2, 3] })]);
    const [p] = estimates(s);
    expect(p!.shares.map((x) => [x.fundName, x.netCents, x.vatCents, x.shortCents])).toEqual([
      ["A", 100_000, 22_000, 0],
      ["B", 50_000, 5_500, 0],
    ]);
    expect(p!.amounts.vatCents).toBe(27_500); // each part with its own sponsor's rate
    expect(p!.fundName).toBe("A + B");
    expect(p!.shortCents).toBe(0);
  });

  it("funds are drawn down in the order of the sheet", () => {
    const s = build([a, b], [contract(1, 2, 1000), contract(2, 3, 5000)], [
      figures(1, 800, { fundIds: [2, 3] }),
      figures(1, 500, { fundIds: [2, 3] }),
    ]);
    const [first, second] = estimates(s);
    expect(first!.shares.map((x) => x.netCents)).toEqual([80_000, 0]);
    expect(second!.shares.map((x) => x.netCents)).toEqual([20_000, 30_000]); // A had 200.00 left
  });

  it("the last fund takes what remains, goes negative, and the line is flagged as short", () => {
    const s = build([a, b], [contract(1, 2, 100), contract(2, 3, 100)], [figures(1, 500, { fundIds: [2, 3] })]);
    const [p] = estimates(s);
    expect(p!.shares.map((x) => x.netCents)).toEqual([10_000, 40_000]);
    expect(p!.shortCents).toBe(30_000); // B only had 100.00 of the 400.00 it was asked
    const [rowA, rowB] = fundSummary(s, "estimate");
    expect([rowA!.leftCents, rowB!.leftCents]).toEqual([0, -30_000]);
  });

  it("a single fund that is not enough flags the line too", () => {
    const [p] = estimates(build([a], [contract(1, 2, 100)], [figures(1, 300, { fundIds: [2] })]));
    expect(p!.shortCents).toBe(20_000);
  });

  it("a fund that covers VAT only pays the net that fits with its VAT; the team pays the rest", () => {
    const covers = sponsorFund(2, { group: "g", paysVat: true });
    const s = build([covers], [contract(1, 2, 122)], [figures(1, 200, { fundIds: [2, 1], vatRate: 22 })]);
    const [p] = estimates(s);
    expect(p!.shares.map((x) => [x.fundName, x.netCents, x.vatCents, x.drawnCents])).toEqual([
      ["Sponsor 2", 10_000, 2_200, 12_200], // 122.00 = 100.00 + 22.00 of VAT: all it has
      ["Team's fund", 10_000, 2_200, 10_000],
    ]);
    expect(p!.teamVatCents).toBe(2_200); // only the team's own part
    expect(p!.teamFundCents).toBe(10_000);
    expect(p!.shortCents).toBe(0); // the team fund is never short
  });

  it("the team fund as last resort uses the rate typed on the line", () => {
    const s = build([a], [contract(1, 2, 100)], [figures(1, 300, { fundIds: [2, 1], vatRate: 0 })]);
    const [p] = estimates(s);
    expect(p!.shares.map((x) => [x.netCents, x.vatCents])).toEqual([[10_000, 2_200], [20_000, 0]]);
  });
});

describe("lines without funds", () => {
  it("keep the single-rate formula of the old sheet", () => {
    const [p] = estimates(build([], [], [figures(1, 1000, { sponsorType: "none", vatRate: 22 })]));
    expect(p!.amounts).toMatchObject({ vatCents: 22_000, complete: true });
    expect(p!.shares).toEqual([]);
    expect(p!.fundName).toBeNull();
  });

  it("a team-fund line with no rate yet is incomplete", () => {
    const [p] = estimates(build([], [], [figures(1, 1000, { fundIds: [1], vatRate: null })]));
    expect(p!.amounts.complete).toBe(false);
    expect(p!.amounts.vatCents).toBe(0);
  });
});
