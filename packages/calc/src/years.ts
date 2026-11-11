import { ZERO_AMOUNTS } from "./line";
import type { CalcLine, PhaseCalc } from "./lines";
import { PHASES, type Phase } from "./types";

// The lines of a calendar year (1 January - 31 December), for YEAR TOTAL: each phase goes by its own
// purchase date, so a line planned in December and bought in January is in both years, once each.
// docs/stagioni-anni-fiscali-e-macchine.md

/** A phase that counts for nothing: what a line has in a year where its phase is not. */
const NOTHING: PhaseCalc = {
  figures: null,
  amounts: { ...ZERO_AMOUNTS, complete: true },
  unitPriceE4: { net: 0, gross: 0 },
  shares: [],
  fundName: null,
  shortCents: 0,
  teamFundCents: 0,
  paidCents: 0,
  teamFundDueCents: 0,
  cashDate: null,
  supplierId: null,
  supplierName: null,
  purchaseDate: null,
  arrivalDate: null,
  teamVatCents: 0,
  vatDueDate: null,
};

const inYear = (date: string | null, year: string) => date !== null && date.slice(0, 4) === year;

/** The lines with a phase bought (or planned) in `year`; their other phase counts for nothing. */
export function linesOfYear(lines: CalcLine[], year: string): CalcLine[] {
  return lines
    .filter((l) => PHASES.some((phase) => inYear(l[phase].purchaseDate, year)))
    .map((l) => ({
      ...l,
      estimate: inYear(l.estimate.purchaseDate, year) ? l.estimate : NOTHING,
      actual: inYear(l.actual.purchaseDate, year) ? l.actual : NOTHING,
    }));
}

/** The GRAND TOTAL of the phases written in but without a purchase date yet: they are in no year. */
export function undatedGross(lines: CalcLine[]): Record<Phase, number> {
  const sum = (phase: Phase) =>
    lines.filter((l) => l[phase].figures !== null && l[phase].purchaseDate === null).reduce((cents, l) => cents + l[phase].amounts.grossCents, 0);
  return { estimate: sum("estimate"), actual: sum("actual") };
}
