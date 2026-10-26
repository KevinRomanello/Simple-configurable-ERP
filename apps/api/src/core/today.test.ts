import { describe, expect, it } from "vitest";
import { today } from "./today";

describe("today", () => {
  it("is the day on the team's clock, not in UTC", () => {
    // 23:30 UTC on the 26th is already 00:30 of the 27th in Rome (winter time, UTC+1)
    expect(today(new Date("2026-10-26T23:30:00Z"))).toBe("2026-10-27");
    // summer time is UTC+2: 22:30 UTC is already the next day
    expect(today(new Date("2026-07-01T22:30:00Z"))).toBe("2026-07-02");
  });

  it("does not change before midnight in Rome", () => {
    expect(today(new Date("2026-10-26T22:30:00Z"))).toBe("2026-10-26");
    expect(today(new Date("2026-07-01T21:30:00Z"))).toBe("2026-07-01");
  });

  it("crosses the new year with the Roman clock", () => {
    expect(today(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
  });

  it("does not depend on the time zone of the machine", () => {
    const before = process.env.TZ;
    try {
      process.env.TZ = "America/Los_Angeles";
      expect(today(new Date("2026-10-26T23:30:00Z"))).toBe("2026-10-27");
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
  });
});
