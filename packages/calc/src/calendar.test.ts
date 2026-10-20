import { describe, expect, it } from "vitest";
import {
  addDays, monthKey, monthRange, nextMondayIfWeekend, parseFlexibleDate, quarterOf, weekday,
} from "./dates";

// Everything here is checked against JavaScript's own Date, which is independent from the
// functions under test (they work on ISO strings).

const DAY = 86_400_000;
const isoOf = (time: number) => new Date(time).toISOString().slice(0, 10);

/** Every day from `from` to `to` (inclusive), as a start-of-day UTC time. */
function* days(from: [number, number, number], to: [number, number, number]) {
  for (let t = Date.UTC(...from); t <= Date.UTC(...to); t += DAY) yield t;
}

describe("calendar arithmetic on every day of 2000-2100", () => {
  it("knows the weekday, the quarter and the month key of each day", () => {
    for (const t of days([2000, 0, 1], [2100, 11, 31])) {
      const iso = isoOf(t);
      const date = new Date(t);
      expect([iso, weekday(iso)]).toEqual([iso, date.getUTCDay()]);
      expect(quarterOf(iso)).toEqual({ year: date.getUTCFullYear(), quarter: Math.floor(date.getUTCMonth() / 3) + 1 });
      expect(monthKey(iso)).toBe(iso.slice(0, 7));
    }
  });

  it("adds days and moves a weekend to the Monday", () => {
    for (const t of days([2000, 0, 1], [2100, 11, 31])) {
      const iso = isoOf(t);
      for (const n of [1, 31, 366, -1, -400]) expect([iso, n, addDays(iso, n)]).toEqual([iso, n, isoOf(t + n * DAY)]);
      const wd = new Date(t).getUTCDay();
      expect(nextMondayIfWeekend(iso)).toBe(isoOf(t + (wd === 6 ? 2 : wd === 0 ? 1 : 0) * DAY));
    }
  });

  it("reads every day written in each notation the old sheet used", () => {
    for (const t of days([2000, 0, 1], [2099, 11, 31])) {
      const iso = isoOf(t);
      const [y, m, d] = iso.split("-") as [string, string, string];
      for (const text of [iso, `${d}/${m}/${y}`, `${d}-${m}-${y}`, `${Number(d)}/${Number(m)}/${y}`, `${d}/${m}/${y.slice(2)}`]) {
        expect([text, parseFlexibleDate(text)]).toEqual([text, iso]);
      }
    }
  });
});

describe("years before 100 (Date.UTC would read them as 19xx)", () => {
  it("gets the weekday right: 1 January of the year 1 was a Monday", () => {
    expect(weekday("0001-01-01")).toBe(1);
    expect(weekday("0099-12-31")).toBe(new Date(new Date(0).setUTCFullYear(99, 11, 31)).getUTCDay());
  });

  it("knows which early years are leap years", () => {
    expect(parseFlexibleDate("0004-02-29")).toBe("0004-02-29");
    expect(parseFlexibleDate("0100-02-29")).toBeNull(); // divisible by 100, not by 400
    expect(parseFlexibleDate("0400-02-29")).toBe("0400-02-29");
  });

  it("adds days across the boundary", () => {
    expect(addDays("0099-12-31", 1)).toBe("0100-01-01");
  });
});

describe("parseFlexibleDate", () => {
  it("refuses days that do not exist", () => {
    for (const text of ["2026-02-29", "2100-02-29", "2026-04-31", "31/04/2026", "00/01/2026", "1/13/2026", "2026-00-10", "2026-01-00", "32/01/2026"]) {
      expect([text, parseFlexibleDate(text)]).toEqual([text, null]);
    }
    for (const text of ["2024-02-29", "2000-02-29", "29/02/2028"]) expect(parseFlexibleDate(text)).not.toBeNull();
  });

  it("never throws, whatever it is given", () => {
    let seed = 7;
    const next = (n: number) => ((seed = (seed * 1664525 + 1013904223) % 4294967296), Math.floor((seed / 4294967296) * n));
    for (let i = 0; i < 5_000; i++) {
      const text = Array.from({ length: next(15) }, () => String.fromCharCode(32 + next(570))).join("");
      expect(() => parseFlexibleDate(text)).not.toThrow();
    }
  });
});

describe("monthRange", () => {
  it("lists every month, both ends included, and nothing when the range is reversed", () => {
    expect(monthRange("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(monthRange("2026-05", "2026-05")).toEqual(["2026-05"]);
    expect(monthRange("2026-05", "2026-04")).toEqual([]);
  });
});
