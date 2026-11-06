import { describe, expect, it } from "vitest";
import { calendarYears } from "./calendarYears";
import { figures, line, snapshot } from "./fixtures";
import { computeLines } from "./lines";

const bought = (date: string | null, euros = 100) => figures(1, euros, { purchaseDate: date, vatRate: 22, fundIds: [1] });

describe("calendarYears", () => {
  it("puts each phase in the year of its own purchase date, the oldest year first and the ones without a date last", () => {
    const lines = computeLines(
      snapshot({
        projects: [{ id: 1, areaId: 1, name: "Brakes", ownerName: null, position: 1 }],
        lines: [
          line(1, 1, bought("2026-12-31"), bought("2027-01-01")), // planned in one year, bought in the next
          line(2, 1, bought(null, 50), null), // nothing written in ACTUAL: counted nowhere
          line(3, 1, bought("2025-06-01"), bought("2025-06-02")),
        ],
      }),
    );
    const { rows, total } = calendarYears(lines);
    expect(rows.map((r) => [r.year, r.estimate.grossCents, r.actual.grossCents])).toEqual([
      ["2025", 12_200, 12_200],
      ["2026", 12_200, 0],
      ["2027", 0, 12_200],
      [null, 6_100, 0],
    ]);
    expect(total.estimate).toEqual({ grossCents: 30_500, sponsorCents: 0, outflowCents: 30_500, teamVatCents: 5_500 });
    expect(total.actual.teamVatCents).toBe(4_400);
  });

  it("has no rows without purchases", () => {
    expect(calendarYears([])).toEqual({ rows: [], total: calendarYears([]).total });
    expect(calendarYears([]).total.actual.grossCents).toBe(0);
  });
});
