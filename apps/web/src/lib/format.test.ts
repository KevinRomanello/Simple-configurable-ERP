import { describe, expect, it } from "vitest";
import { date, dateTime, money, moneyE4, quantity, moneyFromDecimal, moneyShort, month, monthOfDate, ratio } from "./format";

const plain = (text: string) => text.replace(/ /g, " ");

describe("format", () => {
  it("formats cents as euros with the thousands always grouped", () => {
    expect(plain(money(122_000))).toBe("1.220,00 €");
    expect(plain(money(100_000_000))).toBe("1.000.000,00 €");
    expect(plain(money(999))).toBe("9,99 €");
    expect(plain(money(5))).toBe("0,05 €");
    expect(plain(money(-550))).toBe("-5,50 €");
  });

  it("hides zero or missing amounts when asked", () => {
    expect(money(0, true)).toBe("");
    expect(plain(money(0))).toBe("0,00 €");
    expect(money(null)).toBe("");
  });

  it("formats decimal strings from the API exactly", () => {
    expect(plain(moneyFromDecimal("1234.50"))).toBe("1.234,50 €");
    expect(plain(moneyFromDecimal("10000.00"))).toBe("10.000,00 €");
    expect(plain(moneyFromDecimal("0.07"))).toBe("0,07 €");
    expect(plain(moneyFromDecimal("-12.3"))).toBe("-12,30 €");
    expect(moneyFromDecimal(null)).toBe("");
  });

  it("rounds whole euros for chart axes", () => {
    expect(plain(moneyShort(11272.8))).toBe("11.273 €");
    expect(plain(moneyShort(-1500))).toBe("-1.500 €");
  });

  it("formats dates and months like the old sheet", () => {
    expect(date("2026-11-20")).toBe("20/11/26");
    expect(date(null)).toBe("");
    expect(month("2026-11")).toBe("nov 26");
    expect(monthOfDate("2026-10-15")).toBe("oct 26");
  });

  it("formats an instant as local date and time", () => {
    expect(dateTime(new Date(2026, 10, 20, 14, 5).toISOString())).toBe("20/11/26 14:05");
    expect(dateTime(new Date(2026, 0, 3, 9, 0).toISOString())).toBe("03/01/26 09:00");
  });

  it("formats ratios as percentages", () => {
    expect(ratio(0.1).replace(/\s/g, "")).toBe("10%");
    expect(ratio(null)).toBe("");
  });

  it("formats unit prices with the decimals they need, at least two", () => {
    expect(plain(moneyE4(224_500))).toBe("22,45 €");
    expect(plain(moneyE4(850))).toBe("0,085 €");
    expect(plain(moneyE4(119))).toBe("0,0119 €");
    expect(plain(moneyE4(10_000))).toBe("1,00 €");
    expect(plain(moneyE4(12_345_678))).toBe("1.234,5678 €");
    expect(plain(moneyE4(-1_250))).toBe("-0,125 €");
    expect(moneyE4(null)).toBe("");
  });

  it("formats quantities with the decimals they need", () => {
    expect(quantity(2_000)).toBe("2");
    expect(quantity(2_500)).toBe("2,5");
    expect(quantity(1_200_000)).toBe("1.200");
    expect(quantity(125)).toBe("0,125");
    expect(quantity(-3_000)).toBe("-3");
    expect(quantity(0)).toBe("0");
    expect(quantity(null)).toBe("");
  });
});
