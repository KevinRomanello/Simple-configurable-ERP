import { describe, expect, it } from "vitest";
import { editNumber, parseNumber, shift, showNumber } from "./params";

const ohm = { unit: "Ω", prefixes: true };
const farad = { unit: "F", prefixes: true };
const section = { unit: "mm²", prefixes: false };

describe("shift", () => {
  it("moves the point as text, both ways", () => {
    expect(shift("4.7", 3)).toBe("4700");
    expect(shift("100", -9)).toBe("0.0000001");
    expect(shift("0.0047", 3)).toBe("4.7");
    expect(shift("12", 0)).toBe("12");
  });
});

describe("parseNumber", () => {
  it("reads the prefixes, the way a schematic writes them, a comma, and the unit typed after", () => {
    expect(parseNumber("10k", ohm)).toBe("10000");
    expect(parseNumber("4.7k", ohm)).toBe("4700");
    expect(parseNumber("4,7 k", ohm)).toBe("4700");
    expect(parseNumber("4k7", ohm)).toBe("4700");
    expect(parseNumber("2M2", ohm)).toBe("2200000");
    expect(parseNumber("10K", ohm)).toBe("10000");
    expect(parseNumber("100n", farad)).toBe("0.0000001");
    expect(parseNumber("100nF", farad)).toBe("0.0000001");
    expect(parseNumber("4.7u", farad)).toBe("0.0000047");
    expect(parseNumber("4.7µ", farad)).toBe("0.0000047");
    expect(parseNumber("1.5p", farad)).toBe("0.0000000000015");
    expect(parseNumber("100m", { unit: "W", prefixes: true })).toBe("0.1");
    expect(parseNumber("12mm", { unit: "m", prefixes: true })).toBe("0.012"); // milli, then the unit
    expect(parseNumber("-40", { unit: "°C", prefixes: false })).toBe("-40");
    expect(parseNumber("007.50", ohm)).toBe("7.5");
  });

  it("refuses what is not a number, and a prefix where the parameter takes none", () => {
    expect(parseNumber("ten", ohm)).toBeNull();
    expect(parseNumber("", ohm)).toBeNull();
    expect(parseNumber("1.2.3", ohm)).toBeNull();
    expect(parseNumber("10x", ohm)).toBeNull();
    expect(parseNumber("1.5k", section)).toBeNull();
    expect(parseNumber("1,5", section)).toBe("1.5");
    expect(parseNumber("1.5mm²", section)).toBe("1.5");
    expect(parseNumber("1000000000000000G", ohm)).toBeNull(); // too big to keep
  });
});

describe("showNumber and editNumber", () => {
  it("show the number with the prefix that keeps it between 1 and 999", () => {
    expect(showNumber("4700", ohm)).toBe("4,7 kΩ");
    expect(showNumber("10000", ohm)).toBe("10 kΩ");
    expect(showNumber("999", ohm)).toBe("999 Ω");
    expect(showNumber("0.0000001", farad)).toBe("100 nF");
    expect(showNumber("0.0000000000015", farad)).toBe("1,5 pF");
    expect(showNumber("0.1", { unit: "W", prefixes: true })).toBe("100 mW");
    expect(showNumber("0", ohm)).toBe("0 Ω");
    expect(showNumber("-0.04", { unit: "A", prefixes: true })).toBe("-40 mA");
  });

  it("without prefixes, the number as it is, grouped like the rest of the app", () => {
    expect(showNumber("1.5", section)).toBe("1,5 mm²");
    expect(showNumber("1500", section)).toBe("1.500 mm²");
    expect(showNumber("12", { unit: null, prefixes: false })).toBe("12");
  });

  it("give back, in the form, what reads back to the same number", () => {
    for (const value of ["4700", "0.0000001", "2200000", "0.1", "12", "-40"]) {
      expect(parseNumber(editNumber(value, ohm), ohm)).toBe(value);
    }
    expect(editNumber("4700", ohm)).toBe("4.7k");
  });
});
