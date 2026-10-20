import { describe, expect, it } from "vitest";
import { fromCents, fromScaled, toCents, toScaled } from "./money";

describe("toScaled", () => {
  it("converts decimal strings without floating point", () => {
    expect(toCents("12.34")).toBe(1234);
    expect(toCents("0.07")).toBe(7);
    expect(toCents("-5.50")).toBe(-550);
    expect(toScaled("44.1300", 4)).toBe(441300);
    expect(toScaled("5", 3)).toBe(5000);
  });

  it("treats missing values as zero", () => {
    expect(toCents(null)).toBe(0);
    expect(toCents(undefined)).toBe(0);
    expect(toCents("")).toBe(0);
  });

  it("accepts trailing zeros beyond the scale but rejects lost digits", () => {
    expect(toCents("1.500")).toBe(150);
    expect(() => toCents("1.505")).toThrow();
    expect(() => toCents("abc")).toThrow();
  });
});

describe("fromScaled", () => {
  it("formats integers back to decimal strings", () => {
    expect(fromCents(1234)).toBe("12.34");
    expect(fromCents(7)).toBe("0.07");
    expect(fromCents(-550)).toBe("-5.50");
    expect(fromScaled(441300, 4)).toBe("44.1300");
    expect(fromScaled(42, 0)).toBe("42");
  });

  it("round-trips", () => {
    for (const text of ["0.00", "0.01", "999999999999.99", "-1.00"]) {
      expect(fromCents(toCents(text))).toBe(text);
    }
  });
});
