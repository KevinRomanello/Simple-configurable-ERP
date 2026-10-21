import { describe, expect, it } from "vitest";
import { base64Bytes, fitSize } from "./image";
import { todayIso } from "./today";

describe("fitSize", () => {
  it("shrinks to fit a square, keeping the proportions", () => {
    expect(fitSize(4000, 3000, 1200)).toEqual({ width: 1200, height: 900 });
    expect(fitSize(3000, 4000, 1200)).toEqual({ width: 900, height: 1200 });
    expect(fitSize(2000, 2000, 240)).toEqual({ width: 240, height: 240 });
  });

  it("never makes a small picture bigger, and never gives a side of zero", () => {
    expect(fitSize(300, 200, 1200)).toEqual({ width: 300, height: 200 });
    expect(fitSize(10_000, 1, 100)).toEqual({ width: 100, height: 1 });
  });
});

describe("base64Bytes", () => {
  it("counts the bytes behind a base64 text, padding included", () => {
    expect(base64Bytes(btoa("abc"))).toBe(3);
    expect(base64Bytes(btoa("abcd"))).toBe(4);
    expect(base64Bytes(btoa("abcde"))).toBe(5);
  });
});

describe("todayIso", () => {
  it("is the day on the clock of the person, with two digits for month and day", () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(todayIso(new Date(2026, 10, 20, 0, 1))).toBe("2026-11-20");
  });
});
