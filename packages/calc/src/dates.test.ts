import { describe, expect, it } from "vitest";
import {
  addDays,
  monthKey,
  monthRange,
  monthSpan,
  nextMondayIfWeekend,
  parseFlexibleDate,
  quarterFromIndex,
  quarterIndex,
  quarterOf,
  weekday,
} from "./dates";

describe("calendar helpers", () => {
  it("finds the weekday regardless of the machine time zone", () => {
    expect(weekday("2027-05-16")).toBe(0); // Sunday
    expect(weekday("2026-11-14")).toBe(6); // Saturday
    expect(weekday("2026-11-16")).toBe(1); // Monday
  });

  it("moves weekends to Monday and leaves weekdays alone", () => {
    expect(nextMondayIfWeekend("2027-05-16")).toBe("2027-05-17");
    expect(nextMondayIfWeekend("2026-11-14")).toBe("2026-11-16");
    expect(nextMondayIfWeekend("2026-11-16")).toBe("2026-11-16");
  });

  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("derives month keys and quarters", () => {
    expect(monthKey("2026-11-20")).toBe("2026-11");
    expect(quarterOf("2026-03-31")).toEqual({ year: 2026, quarter: 1 });
    expect(quarterOf("2026-04-01")).toEqual({ year: 2026, quarter: 2 });
    expect(quarterOf("2026-12-31")).toEqual({ year: 2026, quarter: 4 });
  });

  it("converts quarters to an index and back", () => {
    const q = { year: 2027, quarter: 1 } as const;
    expect(quarterFromIndex(quarterIndex(q))).toEqual(q);
    expect(quarterIndex({ year: 2027, quarter: 1 })).toBe(quarterIndex({ year: 2026, quarter: 4 }) + 1);
  });

  it("lists every month between two keys", () => {
    expect(monthRange("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(monthRange("2026-11", "2026-11")).toEqual(["2026-11"]);
    expect(monthRange("2026-12", "2026-11")).toEqual([]);
  });

  it("finds the span of a set of months", () => {
    expect(monthSpan(["2026-12", "2026-03", "2027-01"])).toEqual(["2026-03", "2027-01"]);
    expect(monthSpan([])).toBeNull();
  });
});

describe("parseFlexibleDate", () => {
  it("reads day/month/year with / or -, two or four digit years", () => {
    expect(parseFlexibleDate("20/11/2026")).toBe("2026-11-20");
    expect(parseFlexibleDate("5-3-27")).toBe("2027-03-05");
    expect(parseFlexibleDate("'05/03/27")).toBe("2027-03-05");
  });

  it("reads month names in English and Italian as the first of the month", () => {
    expect(parseFlexibleDate("Nov 2026")).toBe("2026-11-01");
    expect(parseFlexibleDate("nov 26")).toBe("2026-11-01");
    expect(parseFlexibleDate("gen 27")).toBe("2027-01-01");
    expect(parseFlexibleDate("Mag 2027")).toBe("2027-05-01");
    expect(parseFlexibleDate("Giugno 2027")).toBe("2027-06-01");
  });

  it("reads ISO dates", () => {
    expect(parseFlexibleDate("2026-11-20")).toBe("2026-11-20");
  });

  it("rejects what is not a real date", () => {
    expect(parseFlexibleDate("31/02/2026")).toBeNull();
    expect(parseFlexibleDate("13/13/2026")).toBeNull();
    expect(parseFlexibleDate("2026-02-30")).toBeNull();
    expect(parseFlexibleDate("hello")).toBeNull();
    expect(parseFlexibleDate("")).toBeNull();
    expect(parseFlexibleDate("xyz 2026")).toBeNull();
  });
});
