import { describe, expect, it } from "vitest";
import { figures, settings } from "./fixtures";
import { lineAmounts } from "./line";

// Net 1000.00 = 10 units x 100.00. Expected values are the table in
// docs/regole-script-attuale.md, section 3.
const net1000 = (overrides: Parameters<typeof figures>[2]) => figures(10, 100, overrides);

describe("lineAmounts", () => {
  it("no sponsor, 22% VAT", () => {
    const a = lineAmounts(net1000({ sponsorType: "none", vatRate: 22 }), settings);
    expect(a).toMatchObject({
      netCents: 100_000,
      vatCents: 22_000,
      grossCents: 122_000,
      sponsorCents: 0,
      outflowCents: 122_000,
      complete: true,
    });
  });

  it("no sponsor, no VAT", () => {
    const a = lineAmounts(net1000({ sponsorType: "none", vatRate: 0 }), settings);
    expect(a).toMatchObject({ vatCents: 0, grossCents: 100_000, outflowCents: 100_000 });
  });

  it("partial sponsor: VAT only on what the sponsor does not cover", () => {
    const a = lineAmounts(
      net1000({ sponsorType: "partial", sponsorValueCents: 40_000, vatRate: 22 }),
      settings,
    );
    expect(a).toMatchObject({
      vatCents: 13_200,
      grossCents: 113_200,
      sponsorCents: 40_000,
      outflowCents: 73_200,
    });
  });

  it("total sponsor: the sponsor covers the whole net, VAT stays (old script behaviour)", () => {
    const a = lineAmounts(net1000({ sponsorType: "total", vatRate: 22 }), settings);
    expect(a).toMatchObject({
      vatCents: 22_000,
      grossCents: 122_000,
      sponsorCents: 100_000,
      outflowCents: 22_000,
    });
  });

  it("total sponsor ignores any typed sponsor value", () => {
    const a = lineAmounts(net1000({ sponsorType: "total", sponsorValueCents: 5, vatRate: 0 }), settings);
    expect(a.sponsorCents).toBe(100_000);
  });

  it("open question Q1: VAT on net minus sponsor makes a fully sponsored line VAT free", () => {
    const a = lineAmounts(net1000({ sponsorType: "total", vatRate: 22 }), {
      ...settings,
      vatBaseWhenTotalSponsor: "net-minus-sponsor",
    });
    expect(a).toMatchObject({ vatCents: 0, outflowCents: 0 });
  });

  it("rounds the VAT to the cent per line", () => {
    // 5 x 44.13 = 220.65; 22% = 48.543 -> 48.54
    const a = lineAmounts(figures(5, 44.13), settings);
    expect(a).toMatchObject({ netCents: 22_065, vatCents: 4_854, grossCents: 26_919 });
  });

  it("flags a line whose sponsor type or VAT rate is missing and charges no VAT", () => {
    const noType = lineAmounts(net1000({ sponsorType: null }), settings);
    expect(noType).toMatchObject({ complete: false, vatCents: 0, outflowCents: 100_000 });
    const noRate = lineAmounts(net1000({ vatRate: null }), settings);
    expect(noRate).toMatchObject({ complete: false, vatCents: 0 });
  });

  it("treats a phase without figures as zeros", () => {
    expect(lineAmounts(null, settings)).toEqual({
      netCents: 0,
      vatCents: 0,
      grossCents: 0,
      sponsorCents: 0,
      outflowCents: 0,
      complete: true,
    });
  });
});
