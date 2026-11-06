import type { MoneyIn, Phase, Season, TotalsBlock, TotalsFigures } from "../api/types";

// The three TOTAL pages (season, calendar year, car): what each can show, its rows by area or by
// project, and the comparison of two of them. docs/stagioni-anni-fiscali-e-macchine.md

export type TotalsKind = "season" | "year" | "car";

export interface Choice {
  value: string;
  label: string;
}

/**
 * What a TOTAL page can show, the latest first, and the one of today: the current season, this year,
 * the car of the current season. A car is its name: two seasons with the same car are one.
 */
export function choicesOf(kind: TotalsKind, seasons: Season[], today: string): { choices: Choice[]; current: string } {
  const now = seasons.find((s) => s.current);
  const mark = (label: string, current: boolean) => (current ? `${label} (current)` : label);
  if (kind === "season") {
    return { choices: seasons.map((s) => ({ value: String(s.id), label: mark(s.name, s.current) })), current: String(now?.id ?? "") };
  }
  if (kind === "car") {
    const cars = new Map<string, string>();
    for (const s of seasons) if (!cars.has(s.car.toLowerCase())) cars.set(s.car.toLowerCase(), s.car);
    const currentCar = now?.car.toLowerCase();
    return {
      choices: [...cars.entries()].map(([key, car]) => ({ value: car, label: mark(car, key === currentCar) })),
      current: now?.car ?? "",
    };
  }
  const thisYear = Number(today.slice(0, 4));
  const first = Math.min(thisYear, ...seasons.map((s) => Number(s.startsOn.slice(0, 4))));
  const last = Math.max(thisYear, ...seasons.map((s) => Number(s.endsOn.slice(0, 4))));
  const years = Array.from({ length: last - first + 1 }, (_, i) => last - i);
  return { choices: years.map((y) => ({ value: String(y), label: mark(String(y), y === thisYear) })), current: String(thisYear) };
}

export interface TotalsRowView {
  /** The area, or the area and the project (the same in every season: compared by name). */
  key: string;
  areaName: string;
  project: string | null;
  figures: TotalsFigures;
}

/** The rows of a block: one per area, or one per project of each area. */
export function rowsOf(block: TotalsBlock, byProject: boolean): TotalsRowView[] {
  return block.rows.flatMap((r): TotalsRowView[] =>
    byProject
      ? r.projects.map((p) => ({ key: `${r.areaCode}:${p.name.toLowerCase()}`, areaName: r.areaName, project: p.name, figures: p }))
      : [{ key: r.areaCode, areaName: r.areaName, project: null, figures: r }],
  );
}

export interface ComparedRow {
  key: string;
  areaName: string;
  project: string | null;
  a: number;
  b: number;
  /** b - a. */
  difference: number;
  /** (b - a) / a; null when a is zero. */
  ratio: number | null;
}

const compared = (a: number, b: number) => ({ a, b, difference: b - a, ratio: a === 0 ? null : (b - a) / a });

/** Two TOTALs side by side, row by row (a row that only one of them has counts zero in the other). */
export function compareRows(a: TotalsRowView[], b: TotalsRowView[], pick: (f: TotalsFigures) => number): ComparedRow[] {
  const byKey = new Map(b.map((r) => [r.key, r]));
  const rows = a.map((r) => ({ key: r.key, areaName: r.areaName, project: r.project, ...compared(pick(r.figures), byKey.has(r.key) ? pick(byKey.get(r.key)!.figures) : 0) }));
  const seen = new Set(a.map((r) => r.key));
  for (const r of b) if (!seen.has(r.key)) rows.push({ key: r.key, areaName: r.areaName, project: r.project, ...compared(0, pick(r.figures)) });
  return rows;
}

/** What came in, in two periods, source by source (the same sponsor or source in any case is one row). */
export function compareMoney(a: MoneyIn, b: MoneyIn, phase: Phase): (ComparedRow & { label: string })[] {
  const cents = (r: MoneyIn["rows"][number]) => (phase === "estimate" ? r.estimateCents : r.actualCents);
  const key = (r: MoneyIn["rows"][number]) => `${r.kind}:${r.label.toLowerCase()}`;
  const rows = new Map<string, { label: string; a: number; b: number }>();
  for (const r of a.rows) rows.set(key(r), { label: r.label, a: cents(r), b: 0 });
  for (const r of b.rows) {
    const row = rows.get(key(r)) ?? { label: r.label, a: 0, b: 0 };
    rows.set(key(r), { ...row, b: cents(r) });
  }
  return [...rows.entries()].map(([k, r]) => ({ key: k, areaName: "", project: null, label: r.label, ...compared(r.a, r.b) }));
}
