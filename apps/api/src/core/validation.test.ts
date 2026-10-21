import { describe, expect, it } from "vitest";
import { badValueMessage, retryMessage } from "./errors";
import { decimal, id, isoDate, LIMITS, longText, lookupCode, shortText } from "./validation";

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) => schema.safeParse(value).success;

describe("id", () => {
  it("accepts whole positive numbers up to the largest integer of the database", () => {
    expect(id.parse("42")).toBe(42);
    expect(id.parse(42)).toBe(42);
    expect(id.parse("2147483647")).toBe(2_147_483_647);
  });

  it("refuses everything else, including what Number() would happily read", () => {
    for (const value of ["0", 0, -1, "-1", "1.5", 1.5, "0x10", "1e3", " 1", "1 ", "", "abc", "2147483648", 2_147_483_648, "99999999999", null, undefined, [], {}]) {
      expect([value, ok(id, value)]).toEqual([value, false]);
    }
  });
});

describe("isoDate", () => {
  it("accepts real days between 2000 and 2100", () => {
    for (const value of ["2000-01-01", "2024-02-29", "2100-12-31", "2026-11-20"]) expect(ok(isoDate, value)).toBe(true);
  });

  it("refuses impossible days, other notations and the years outside the period", () => {
    for (const value of ["2026-02-30", "2100-02-29", "1999-12-31", "2101-01-01", "0000-01-01", "0001-01-01", "9999-12-31", "10000-01-01", "-0001-01-01", "2026-1-1", "20/11/2026", " 2026-01-01", "2026-01-01T00:00:00Z", 20260101, null]) {
      expect([value, ok(isoDate, value)]).toEqual([value, false]);
    }
  });
});

describe("decimal", () => {
  const euros = decimal(2, LIMITS.money);

  it("keeps the exact text of the number", () => {
    expect(euros.parse("1234.50")).toBe("1234.50");
    expect(euros.parse(12)).toBe("12");
    expect(euros.parse("0")).toBe("0");
  });

  it("refuses too many decimals, signs, exponents and anything above the limit", () => {
    for (const value of ["1.234", "-1", "+1", "1e3", "1,5", ".5", "5.", "", "abc", "1000000000.01", "9999999999999.99", "99999999999999999999", 1e21, -0.5, NaN, null]) {
      expect([value, ok(euros, value)]).toEqual([value, false]);
    }
    expect(ok(euros, "1000000000")).toBe(true); // exactly the limit
  });
});

describe("text", () => {
  it("trims names and refuses empty, too long and NUL", () => {
    expect(shortText().parse("  Acme  ")).toBe("Acme");
    expect(ok(shortText(), "   ")).toBe(false);
    expect(ok(shortText(), "x".repeat(201))).toBe(false);
    expect(ok(shortText(), "x".repeat(200))).toBe(true);
    expect(ok(shortText(), "a\u0000b")).toBe(false);
    expect(ok(shortText(), 5)).toBe(false);
  });

  it("limits notes and codes, and refuses NUL there too", () => {
    expect(ok(longText, "x".repeat(5_000))).toBe(true);
    expect(ok(longText, "x".repeat(5_001))).toBe(false);
    expect(ok(longText, "a\u0000")).toBe(false);
    expect(ok(lookupCode, "mt-dmt")).toBe(true);
    expect(ok(lookupCode, "x".repeat(101))).toBe(false);
    expect(ok(lookupCode, "a\u0000")).toBe(false);
  });

  it("keeps characters other than NUL: accents, emoji, newlines", () => {
    expect(longText.parse("caffè ☕ 😀\nriga due")).toBe("caffè ☕ 😀\nriga due");
  });
});

describe("badValueMessage (the safety net of the error handler)", () => {
  it("explains the refusals of the database about a value", () => {
    expect(badValueMessage("22003")).toMatch(/out of range/);
    expect(badValueMessage("22001")).toMatch(/too long/);
    expect(badValueMessage("54000")).toMatch(/too long/);
    expect(badValueMessage("22021")).toMatch(/character/);
    expect(badValueMessage("22008")).toMatch(/date/);
  });

  it("tells to try again when the database gave up on one of two simultaneous requests", () => {
    expect(retryMessage("40P01")).toMatch(/try again/);
    expect(retryMessage("40001")).toMatch(/try again/);
    expect(retryMessage("23505")).toBeUndefined();
    expect(retryMessage(undefined)).toBeUndefined();
  });

  it("knows nothing about other failures", () => {
    expect(badValueMessage("23505")).toBeUndefined();
    expect(badValueMessage("XX000")).toBeUndefined();
    expect(badValueMessage(undefined)).toBeUndefined();
  });
});
