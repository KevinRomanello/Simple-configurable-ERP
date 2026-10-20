import { describe, expect, it } from "vitest";
import { netCents, percentOf, roundDiv } from "./money";

describe("roundDiv", () => {
  it("rounds half away from zero", () => {
    expect(roundDiv(5, 2)).toBe(3);
    expect(roundDiv(-5, 2)).toBe(-3);
    expect(roundDiv(4, 2)).toBe(2);
    expect(roundDiv(0, 7)).toBe(0);
  });
});

describe("netCents", () => {
  it("multiplies quantity by unit cost exactly", () => {
    // 5 x 44.13 = 220.65
    expect(netCents(5_000, 441_300)).toBe(22_065);
    // 10 x 100.00 = 1000.00
    expect(netCents(10_000, 1_000_000)).toBe(100_000);
  });

  it("rounds unit costs finer than a cent", () => {
    // 1000 x 0.0355 = 35.50
    expect(netCents(1_000_000, 355)).toBe(3_550);
    // 3 x 0.0125 = 0.0375 -> 4 cents
    expect(netCents(3_000, 125)).toBe(4);
  });
});

describe("percentOf", () => {
  it("applies whole and fractional percentages", () => {
    expect(percentOf(100_000, 22)).toBe(22_000);
    expect(percentOf(100_000, 11)).toBe(11_000);
    expect(percentOf(100_000, 4.5)).toBe(4_500);
    expect(percentOf(22_065, 22)).toBe(4_854); // 48.543 -> 48.54
    expect(percentOf(0, 22)).toBe(0);
  });
});
