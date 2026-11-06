import type { CalcLine } from "./lines";
import { PHASES, type Phase } from "./types";

// The purchases of every season by calendar year (1 January - 31 December), for the accounts of
// the association. Each phase goes by its own purchase date. docs/stagioni-anni-fiscali-e-macchine.md

export interface YearFigures {
  grossCents: number;
  sponsorCents: number;
  outflowCents: number;
  /** The VAT the team pays out of its own cash on these purchases. */
  teamVatCents: number;
}

export interface CalendarYearRow {
  /** "2026"; null for the purchases without a date yet. */
  year: string | null;
  estimate: YearFigures;
  actual: YearFigures;
}

export interface CalendarYears {
  rows: CalendarYearRow[];
  total: Record<Phase, YearFigures>;
}

const zero = (): YearFigures => ({ grossCents: 0, sponsorCents: 0, outflowCents: 0, teamVatCents: 0 });

function add(target: YearFigures, line: CalcLine, phase: Phase) {
  const calc = line[phase];
  target.grossCents += calc.amounts.grossCents;
  target.sponsorCents += calc.amounts.sponsorCents;
  target.outflowCents += calc.amounts.outflowCents;
  target.teamVatCents += calc.teamVatCents;
}

/** One row per calendar year with purchases, the oldest first, then the ones without a date; a phase with nothing written counts nowhere. */
export function calendarYears(lines: CalcLine[]): CalendarYears {
  const rows = new Map<string | null, CalendarYearRow>();
  const total = { estimate: zero(), actual: zero() };
  for (const line of lines) {
    for (const phase of PHASES) {
      if (line[phase].figures === null) continue;
      const year = line[phase].purchaseDate?.slice(0, 4) ?? null;
      let row = rows.get(year);
      if (!row) {
        row = { year, estimate: zero(), actual: zero() };
        rows.set(year, row);
      }
      add(row[phase], line, phase);
      add(total[phase], line, phase);
    }
  }
  const sorted = [...rows.values()].sort((a, b) => (a.year === null ? 1 : b.year === null ? -1 : a.year.localeCompare(b.year)));
  return { rows: sorted, total };
}
