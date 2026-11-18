// The financial statement ("rendiconto"): the table of income and costs the team must show, worked out from the
// register the way the sheet "voci di ricavocosto" does it, defects included. Pure, like the rest of the engine:
// money in cents, no I/O. docs/registro-di-cassa.md

import type { CashAccount } from "./register";

/** One row of the table, as the sheet lays it out. `row` is the row number of the sheet: the sums refer to it. */
export type StatementSpec =
  | { row: number; kind: "blank" }
  /** RICAVI or COSTI: a heading, with no amount. */
  | { row: number; kind: "title"; label: string }
  /** The movements of the Voce with this name, in Cassa, Banca and Paypal. */
  | { row: number; kind: "voce"; label: string; bold: boolean }
  /** The rows added up; `total` marks the ones that add up whole sections. */
  | { row: number; kind: "sum"; label: string; of: number[]; total: boolean }
  /** What is left: the revenues minus the costs, both without sign. */
  | { row: number; kind: "result"; label: string; plus: number; minus: number };

export interface StatementEntry {
  /** The name of the Voce of the movement, null when it has none. */
  voce: string | null;
  account: CashAccount;
  /** Positive for money in, negative for money out. */
  cents: number;
}

export interface StatementRow {
  row: number;
  kind: StatementSpec["kind"];
  label: string;
  bold: boolean;
  /** Only a sum: it adds up whole sections. */
  total: boolean;
  /** Money in minus money out (the sheet's column B); null on a row with no amount. */
  cents: number | null;
  /** The same without its sign (the sheet's column C, "importi parziali"); on the result, revenues minus costs. */
  partialCents: number | null;
}

/** The way the sheet finds a Voce: the same name, whatever the capitals and the spaces. */
export const voceKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

function byVoce(entries: StatementEntry[]): Map<string, StatementEntry[]> {
  const groups = new Map<string, StatementEntry[]>();
  for (const entry of entries) {
    if (entry.voce === null) continue;
    const key = voceKey(entry.voce);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return groups;
}

/** The sheet writes in bold the titles, the sums and the result, and the few Voci that stand for a whole section. */
const isBold = (spec: StatementSpec) => spec.kind !== "blank" && (spec.kind !== "voce" || spec.bold);

/** The statement for these movements (the ones of the year to show), row by row as the layout says. */
export function financialStatement(entries: StatementEntry[], layout: StatementSpec[]): StatementRow[] {
  const groups = byVoce(entries);
  const specs = new Map(layout.map((spec) => [spec.row, spec]));
  const known = new Map<number, number>();

  const centsOf = (row: number): number => {
    const found = known.get(row);
    if (found !== undefined) return found;
    const spec = specs.get(row);
    const cents = spec?.kind === "voce" ? voceCents(spec) : spec?.kind === "sum" ? spec.of.reduce((sum, r) => sum + centsOf(r), 0) : 0;
    known.set(row, cents);
    return cents;
  };
  const voceCents = (spec: Extract<StatementSpec, { kind: "voce" }>): number =>
    (groups.get(voceKey(spec.label)) ?? []).reduce((sum, e) => sum + e.cents, 0);

  return layout.map((spec): StatementRow => {
    const base = { row: spec.row, kind: spec.kind, label: "label" in spec ? spec.label : "", bold: isBold(spec), total: spec.kind === "sum" && spec.total };
    if (spec.kind === "result") return { ...base, cents: null, partialCents: Math.abs(centsOf(spec.plus)) - Math.abs(centsOf(spec.minus)) };
    if (spec.kind !== "voce" && spec.kind !== "sum") return { ...base, cents: null, partialCents: null };
    const cents = centsOf(spec.row);
    return { ...base, cents, partialCents: Math.abs(cents) };
  });
}

/**
 * For every Voce a row of the layout reads, the section it is in: the nearest sum above it that is not a total (the
 * Voce "8.2 Imposta di bollo" is in "8. IMPOSTE E TASSE"). A Voce that no section adds up is its own section. The keys
 * are `voceKey`s, in the order of the layout.
 */
export function sectionsOfVoci(layout: StatementSpec[]): Map<string, string> {
  const inSection = new Map<number, string>();
  for (const spec of layout) {
    if (spec.kind === "sum" && !spec.total) for (const row of spec.of) inSection.set(row, spec.label);
  }
  return new Map(layout.flatMap((spec) => (spec.kind === "voce" ? [[voceKey(spec.label), inSection.get(spec.row) ?? spec.label] as const] : [])));
}
