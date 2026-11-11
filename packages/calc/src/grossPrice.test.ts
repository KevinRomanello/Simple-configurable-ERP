import { describe, expect, it } from "vitest";
import { linePricesE4 } from "./arrival";
import { figures, line, settings, snapshot, sponsorFund, teamFund } from "./fixtures";
import { lineAmounts } from "./line";
import { computeLines } from "./lines";
import type { Figures, FundInput } from "./snapshot";

// A price typed WITH the VAT in it (docs/prezzo-lordo.md): the gross is what was typed and never
// moves, the net is what is left when the VAT is taken out, and the VAT is the difference.

/** `qty` units at `unitEuros` each with the VAT in it; the net price is not typed. */
const gross = (qty: number, unitEuros: number, overrides: Partial<Figures> = {}): Figures =>
  figures(qty, 0, { unitGrossE4: Math.round(unitEuros * 10_000), ...overrides });

const contract = (id: number, fundId: number, euros: number) => ({ id, fundId, phase: "estimate" as const, amountCents: euros * 100, inflowDate: null });

function build(funds: FundInput[], contracts: ReturnType<typeof contract>[], lines: Figures[]) {
  return snapshot({
    projects: [{ id: 1, areaId: 1, name: "P", ownerName: null, position: 1 }],
    funds: [teamFund, ...funds],
    contracts,
    lines: lines.map((f, index) => line(index + 1, 1, f)),
  });
}
const estimates = (s: ReturnType<typeof build>) => computeLines(s).map((l) => l.estimate);

describe("a price typed with the VAT, paid by the team fund or by nobody yet", () => {
  it("takes the VAT out at the rate of the line: 122,00 at 22% is 100,00 and 22,00", () => {
    expect(lineAmounts(gross(1, 122), settings)).toEqual({ netCents: 10_000, vatCents: 2_200, grossCents: 12_200, sponsorCents: 0, outflowCents: 12_200, complete: true });
  });

  it("keeps the cents typed: 10,01 at 22% stays 10,01 (the net 8,20 and the VAT 1,81), where a net price could not make it", () => {
    const amounts = lineAmounts(gross(1, 10.01), settings);
    expect(amounts).toMatchObject({ grossCents: 1_001, netCents: 820, vatCents: 181 });
  });

  it("multiplies the price with the VAT by the quantity: 1000 pieces at 1,00 are 1000,00, not 1000,03", () => {
    const amounts = lineAmounts(gross(1000, 1), settings);
    expect(amounts).toMatchObject({ grossCents: 100_000, netCents: 81_967, vatCents: 18_033 });
  });

  it("with a rate of 0% the net is the gross", () => {
    expect(lineAmounts(gross(2, 50, { vatRate: 0 }), settings)).toMatchObject({ netCents: 10_000, vatCents: 0, grossCents: 10_000, complete: true });
  });

  it("without a rate or a sponsor type there is no VAT yet: the price counts as the net and the line is incomplete", () => {
    expect(lineAmounts(gross(1, 122, { vatRate: null }), settings)).toMatchObject({ netCents: 12_200, vatCents: 0, grossCents: 12_200, outflowCents: 12_200, complete: false });
    expect(lineAmounts(gross(1, 122, { sponsorType: null }), settings)).toMatchObject({ vatCents: 0, complete: false });
  });

  it("a total sponsor covers the net and leaves the VAT; with the VAT taken on what the sponsor does not cover, nothing is left", () => {
    expect(lineAmounts(gross(1, 122, { sponsorType: "total" }), settings)).toMatchObject({ netCents: 10_000, vatCents: 2_200, sponsorCents: 10_000, outflowCents: 2_200 });
    const q1 = { ...settings, vatBaseWhenTotalSponsor: "net-minus-sponsor" as const };
    expect(lineAmounts(gross(1, 122, { sponsorType: "total" }), q1)).toMatchObject({ netCents: 12_200, vatCents: 0, sponsorCents: 12_200, outflowCents: 0 });
  });

  it("through the team fund the VAT is the team's and only the net is bought with the team fund", () => {
    const [p] = estimates(build([], [], [gross(1, 122, { fundIds: [1] })]));
    expect(p!.amounts).toMatchObject({ netCents: 10_000, vatCents: 2_200, grossCents: 12_200, outflowCents: 12_200 });
    expect(p!).toMatchObject({ teamFundCents: 10_000, teamVatCents: 2_200 });
  });
});

describe("a price typed with the VAT, paid by sponsors", () => {
  const a = sponsorFund(2, { vatRate: 22, group: "g" });
  const b = sponsorFund(3, { vatRate: 10, group: "g" });

  it("a sponsor's fund pays the gross out of its balance, at its own rate, not the rate typed on the line", () => {
    const [p] = estimates(build([a], [contract(1, 2, 5000)], [gross(1, 122, { vatRate: 4, fundIds: [2] })]));
    expect(p!.amounts).toMatchObject({ netCents: 10_000, vatCents: 2_200, grossCents: 12_200, outflowCents: 12_200 });
    expect(p!.shares[0]).toMatchObject({ drawnCents: 12_200, teamPaysVat: false });
    expect(p!.teamVatCents).toBe(0);
  });

  it("the balance of the fund goes down by the gross: what is left runs out the next line", () => {
    // 1000,00 in the fund: the first line takes 800,00, the second needs 300,00 and 100,00 are missing
    const [first, second] = estimates(build([a], [contract(1, 2, 1000)], [gross(1, 800, { fundIds: [2] }), gross(1, 300, { fundIds: [2] })]));
    expect(first!.shortCents).toBe(0);
    expect(second!).toMatchObject({ shortCents: 10_000 });
    expect(second!.shares[0]).toMatchObject({ drawnCents: 30_000 });
  });

  it("two funds with different rates: the first pays up to its balance, the rest goes at the rate of the second, and the shares add up to the gross typed", () => {
    // 305,00 in the first (at 22%), the line costs 1000,00 with the VAT: 305,00 = 250,00 + 55,00, the rest 695,00 at 10%
    const [p] = estimates(build([a, b], [contract(1, 2, 305), contract(2, 3, 5000)], [gross(1, 1000, { fundIds: [2, 3] })]));
    expect(p!.shares.map((s) => [s.netCents, s.vatCents, s.drawnCents])).toEqual([
      [25_000, 5_500, 30_500],
      [63_182, 6_318, 69_500],
    ]);
    expect(p!.amounts).toMatchObject({ grossCents: 100_000, netCents: 88_182, vatCents: 11_818, outflowCents: 100_000 });
  });
});

describe("a price typed with the VAT, goods given by a sponsor", () => {
  it("a gift without VAT: the net is the gross and the sponsor covers all of it", () => {
    const [p] = estimates(build([sponsorFund(2, { type: "gift", vatRate: 0 })], [], [gross(1, 100, { fundIds: [2] })]));
    expect(p!.amounts).toMatchObject({ netCents: 10_000, vatCents: 0, sponsorCents: 10_000, outflowCents: 0 });
  });

  it("a gift with a counter-invoice: 111,00 is 100,00 and 11,00, and the team pays the VAT", () => {
    const [p] = estimates(build([sponsorFund(2, { type: "gift_vat", vatRate: 11 })], [], [gross(1, 111, { fundIds: [2], purchaseDate: "2026-11-10" })]));
    expect(p!.amounts).toMatchObject({ netCents: 10_000, vatCents: 1_100, sponsorCents: 10_000, outflowCents: 1_100 });
    expect(p!.teamVatCents).toBe(1_100);
  });
});

describe("the price of one unit, both ways", () => {
  it("a price typed with the VAT is exact and the net is worked out from the amounts of the line", () => {
    const [p] = estimates(build([], [], [gross(1000, 1)]));
    expect(p!.unitPriceE4).toEqual({ net: 8_197, gross: 10_000 });
  });

  it("a price typed without VAT is exact and the gross is worked out", () => {
    const [p] = estimates(build([], [], [figures(2, 100)]));
    expect(p!.unitPriceE4).toEqual({ net: 1_000_000, gross: 1_220_000 });
  });

  it("a line without quantity has no price per unit worked out; and the price of what was bought uses the net of the line", () => {
    expect(estimates(build([], [], [gross(0, 10)]))[0]!.unitPriceE4.net).toBe(0);
    const s = build([], [], []);
    s.lines = [line(1, 1, null, gross(4, 61))];
    const [bought] = computeLines(s);
    expect(linePricesE4(bought!)).toEqual({ net: 500_000, gross: 610_000, team: 610_000 });
  });
});
