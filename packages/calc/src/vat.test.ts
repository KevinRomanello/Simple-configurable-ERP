import { describe, expect, it } from "vitest";
import { vatRules } from "./fixtures";
import { deadlineForQuarter, firstDayOfNextQuarter, vatDeadline } from "./vat";

// Examples are the ones in docs/regole-script-attuale.md, section 4.
describe("vatDeadline", () => {
  it("maps each quarter to its due date", () => {
    expect(vatDeadline("2026-08-05", vatRules)).toBe("2026-11-16"); // Q3 -> 16 Nov (Monday)
    expect(vatDeadline("2026-11-10", vatRules)).toBe("2027-02-16"); // Q4 -> 16 Feb next year (Tuesday)
    expect(vatDeadline("2027-05-20", vatRules)).toBe("2027-08-20"); // Q2 -> 20 Aug (Friday)
  });

  it("moves a Sunday deadline to Monday", () => {
    expect(vatDeadline("2027-02-10", vatRules)).toBe("2027-05-17"); // 16 May 2027 is a Sunday
  });

  it("uses the first and last day of a quarter alike", () => {
    expect(vatDeadline("2026-07-01", vatRules)).toBe(vatDeadline("2026-09-30", vatRules));
  });

  it("keeps a weekend date when the shift is switched off", () => {
    expect(vatDeadline("2027-02-10", { ...vatRules, shiftWeekendToMonday: false })).toBe("2027-05-16");
  });

  it("rejects a malformed date", () => {
    expect(() => vatDeadline("10/02/2027", vatRules)).toThrow();
  });
});

describe("deadlineForQuarter", () => {
  it("gives the due date of a whole quarter", () => {
    expect(deadlineForQuarter({ year: 2026, quarter: 3 }, vatRules)).toBe("2026-11-16");
    expect(deadlineForQuarter({ year: 2027, quarter: 4 }, vatRules)).toBe("2028-02-16");
  });
});

describe("firstDayOfNextQuarter", () => {
  it("is the first day of the following calendar quarter", () => {
    expect(firstDayOfNextQuarter("2026-01-09")).toBe("2026-04-01");
    expect(firstDayOfNextQuarter("2026-05-20")).toBe("2026-07-01");
    expect(firstDayOfNextQuarter("2026-08-05")).toBe("2026-10-01");
    expect(firstDayOfNextQuarter("2026-11-20")).toBe("2027-01-01");
  });

  it("moves on even from the first and the last day of a quarter", () => {
    expect(firstDayOfNextQuarter("2027-01-01")).toBe("2027-04-01");
    expect(firstDayOfNextQuarter("2026-12-31")).toBe("2027-01-01");
    expect(firstDayOfNextQuarter("2028-03-31")).toBe("2028-04-01"); // a leap year
  });

  it("agrees with an independent calculation on every day from 2000 to 2100", () => {
    for (let day = Date.UTC(2000, 0, 1); day <= Date.UTC(2100, 11, 31); day += 86_400_000) {
      const d = new Date(day);
      const next = new Date(Date.UTC(d.getUTCFullYear(), (Math.floor(d.getUTCMonth() / 3) + 1) * 3, 1));
      expect(firstDayOfNextQuarter(d.toISOString().slice(0, 10))).toBe(next.toISOString().slice(0, 10));
    }
  });

  it("fails loudly on a malformed date", () => {
    expect(() => firstDayOfNextQuarter("10/02/2027")).toThrow();
  });
});
