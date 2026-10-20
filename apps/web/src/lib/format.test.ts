import { describe, expect, it } from "vitest";
import { date, money, month, monthOfDate, ratio } from "./format";

describe("format", () => {
  it("formats cents as euros, optionally hiding zero", () => {
    expect(money(122_000).replace(/\s/g, " ")).toBe("1.220,00 €");
    expect(money(0, true)).toBe("");
    expect(money(0)).toContain("0,00");
    expect(money(null)).toBe("");
  });

  it("formats dates and months like the old sheet", () => {
    expect(date("2026-11-20")).toBe("20/11/26");
    expect(date(null)).toBe("");
    expect(month("2026-11")).toBe("nov 26");
    expect(monthOfDate("2026-10-15")).toBe("oct 26");
  });

  it("formats ratios as percentages", () => {
    expect(ratio(0.1).replace(/\s/g, "")).toBe("10%");
    expect(ratio(null)).toBe("");
  });
});
