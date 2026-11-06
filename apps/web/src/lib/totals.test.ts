import { describe, expect, it } from "vitest";
import type { MoneyIn, Season, TotalsBlock, TotalsFigures } from "../api/types";
import { choicesOf, compareMoney, compareRows, rowsOf } from "./totals";

const season = (id: number, start: number, car: string, current = false): Season => ({
  id, name: `${start}-${start + 1}`, startsOn: `${start}-09-01`, endsOn: `${start + 1}-08-31`, car, readOnly: false, current, lines: 0,
});
// the latest first, as GET /api/seasons answers
const seasons = [season(3, 2026, "EG-27", true), season(2, 2025, "eg-25"), season(1, 2024, "EG-25")];

describe("choicesOf", () => {
  it("seasons: every one, today's marked and chosen", () => {
    expect(choicesOf("season", seasons, "2026-11-06")).toEqual({
      choices: [{ value: "3", label: "2026-2027 (current)" }, { value: "2", label: "2025-2026" }, { value: "1", label: "2024-2025" }],
      current: "3",
    });
  });

  it("cars: one per name in any case, the car of today's season chosen", () => {
    expect(choicesOf("car", seasons, "2026-11-06")).toEqual({
      choices: [{ value: "EG-27", label: "EG-27 (current)" }, { value: "eg-25", label: "eg-25" }],
      current: "EG-27",
    });
  });

  it("years: from the first year of the first season to the last of the last one, this year chosen", () => {
    const { choices, current } = choicesOf("year", seasons, "2026-11-06");
    expect(choices.map((c) => c.label)).toEqual(["2027", "2026 (current)", "2025", "2024"]);
    expect(current).toBe("2026");
  });
});

const figures = (estimate: number, actual: number) => ({ estimateOutflowCents: estimate, actualOutflowCents: actual }) as TotalsFigures;
const block = (rows: { code: string; name: string; outflow: number; projects: [string, number][] }[]) =>
  ({
    block: "ALL",
    rows: rows.map((r) => ({ areaCode: r.code, areaName: r.name, ...figures(0, r.outflow), projects: r.projects.map(([name, cents]) => ({ name, ...figures(0, cents) })) })),
  }) as unknown as TotalsBlock;

describe("rowsOf and compareRows", () => {
  const a = block([{ code: "hw", name: "HW", outflow: 300, projects: [["Battery", 100], ["Low voltage", 200]] }]);
  const b = block([{ code: "hw", name: "HW", outflow: 450, projects: [["BATTERY", 150], ["Telemetry", 300]] }]);
  const actual = (f: TotalsFigures) => f.actualOutflowCents;

  it("by area: one row per area", () => {
    expect(compareRows(rowsOf(a, false), rowsOf(b, false), actual)).toEqual([
      { key: "hw", areaName: "HW", project: null, a: 300, b: 450, difference: 150, ratio: 0.5 },
    ]);
  });

  it("by project: the same name in any case is one project; one that only one side has is zero in the other", () => {
    expect(compareRows(rowsOf(a, true), rowsOf(b, true), actual).map((r) => [r.project, r.a, r.b, r.ratio])).toEqual([
      ["Battery", 100, 150, 0.5],
      ["Low voltage", 200, 0, -1],
      ["Telemetry", 0, 300, null],
    ]);
  });
});

describe("compareMoney", () => {
  const money = (rows: [string, "sponsor" | "inflow", number][]): MoneyIn => ({
    rows: rows.map(([label, kind, cents]) => ({ kind, label, asOf: null, estimateCents: 0, actualCents: cents })),
    total: { estimate: 0, actual: rows.reduce((sum, r) => sum + r[2], 0) },
  });

  it("puts the same source together, in any case, and keeps a sponsor apart from an inflow of the same name", () => {
    const rows = compareMoney(money([["Acme", "sponsor", 100], ["Gala", "inflow", 50]]), money([["ACME", "sponsor", 80], ["Acme", "inflow", 10]]), "actual");
    expect(rows.map((r) => [r.label, r.a, r.b, r.difference])).toEqual([
      ["Acme", 100, 80, -20],
      ["Gala", 50, 0, -50],
      ["Acme", 0, 10, 10],
    ]);
  });
});
