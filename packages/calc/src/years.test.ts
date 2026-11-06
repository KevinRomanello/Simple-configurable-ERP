import { describe, expect, it } from "vitest";
import { figures, line, snapshot } from "./fixtures";
import { computeLines } from "./lines";
import { linesOfYear, undatedGross } from "./years";

const bought = (date: string | null, euros = 100) => figures(1, euros, { purchaseDate: date, vatRate: 22, fundIds: [1] });
const lines = computeLines(
  snapshot({
    projects: [{ id: 1, areaId: 1, name: "Brakes", ownerName: null, position: 1 }],
    lines: [
      line(1, 1, bought("2026-12-31"), bought("2027-01-01")), // planned in one year, bought in the next
      line(2, 1, bought(null, 50), null), // written in, no date yet
      line(3, 1, bought("2025-06-01"), bought("2025-06-02")),
    ],
  }),
);

describe("linesOfYear", () => {
  it("keeps each phase only in the year of its own purchase date", () => {
    const of = (year: string) => linesOfYear(lines, year).map((l) => [l.id, l.estimate.amounts.grossCents, l.actual.amounts.grossCents]);
    expect(of("2026")).toEqual([[1, 12_200, 0]]);
    expect(of("2027")).toEqual([[1, 0, 12_200]]);
    expect(of("2025")).toEqual([[3, 12_200, 12_200]]);
    expect(of("2024")).toEqual([]);
  });

  it("leaves nothing of a phase outside the year: no VAT for the team, no funds", () => {
    const [line2026] = linesOfYear(lines, "2026");
    expect(line2026!.actual).toMatchObject({ teamVatCents: 0, shares: [], figures: null });
    expect(line2026!.estimate.teamVatCents).toBe(2_200);
  });
});

describe("undatedGross", () => {
  it("adds up the phases written in without a date: they are in no year", () => {
    expect(undatedGross(lines)).toEqual({ estimate: 6_100, actual: 0 });
  });
});
