import { describe, expect, it } from "vitest";
import { vatRules } from "./fixtures";
import { deadlineForQuarter, vatDeadline } from "./vat";

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
