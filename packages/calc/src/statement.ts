// The financial statement ("rendiconto"): the table of income and costs the team must show, worked out from the
// register the way the sheet "voci di ricavocosto" does it, defects included. Pure, like the rest of the engine:
// money in cents, no I/O. docs/registro-di-cassa.md

import type { CashAccount } from "./register";

/** One row of the table, as the sheet lays it out. `row` is the row number of the sheet: the sums refer to it. */
export type StatementSpec =
  | { row: number; kind: "blank" }
  /** RICAVI or COSTI: what the rows below it are (money in or money out) until the next title. */
  | { row: number; kind: "title"; label: string; side: "in" | "out" }
  /** The movements of the Voce with this name. The sheet leaves the Paypal ones out of some rows. */
  | { row: number; kind: "voce"; label: string; bold: boolean; paypal: boolean }
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
  /** How many movements the row adds up. */
  count: number;
}

interface Figure {
  cents: number;
  count: number;
}

const NOTHING: Figure = { cents: 0, count: 0 };

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
  const figures = new Map<number, Figure>();

  const figureOf = (row: number): Figure => {
    const known = figures.get(row);
    if (known) return known;
    const spec = specs.get(row);
    const figure = spec?.kind === "voce" ? voceFigure(spec) : spec?.kind === "sum" ? sumFigure(spec.of) : NOTHING;
    figures.set(row, figure);
    return figure;
  };
  const voceFigure = (spec: Extract<StatementSpec, { kind: "voce" }>): Figure => {
    const counted = (groups.get(voceKey(spec.label)) ?? []).filter((e) => spec.paypal || e.account !== "paypal");
    return { cents: counted.reduce((sum, e) => sum + e.cents, 0), count: counted.length };
  };
  const sumFigure = (rows: number[]): Figure =>
    rows.map(figureOf).reduce((sum, f) => ({ cents: sum.cents + f.cents, count: sum.count + f.count }), NOTHING);

  return layout.map((spec): StatementRow => {
    const base = { row: spec.row, kind: spec.kind, label: "label" in spec ? spec.label : "", bold: isBold(spec), total: spec.kind === "sum" && spec.total };
    if (spec.kind === "result") return { ...base, cents: null, partialCents: Math.abs(figureOf(spec.plus).cents) - Math.abs(figureOf(spec.minus).cents), count: 0 };
    if (spec.kind !== "voce" && spec.kind !== "sum") return { ...base, cents: null, partialCents: null, count: 0 };
    const { cents, count } = figureOf(spec.row);
    return { ...base, cents, partialCents: Math.abs(cents), count };
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

export type StatementIssueKind =
  /** Movements with no Voce: no row counts them. */
  | "noVoce"
  /** A Voce of the register that no row of the statement reads. */
  | "unknownVoce"
  /** A row that leaves out the Paypal movements. */
  | "paypalLeftOut"
  /** A row that no sum adds up, so no total has it. */
  | "outsideTotals"
  /** A section that is a part of another section, so it is not one of the sections of the total. */
  | "sectionInSection"
  /** A row whose sign is the wrong one for its side; the column without sign hides it. */
  | "wrongSign";

export interface StatementIssue {
  kind: StatementIssueKind;
  /** The row it is about; null when it is about movements that are in no row. */
  row: number | null;
  /** The label of the row, or the name of the Voce no row reads. */
  label: string;
  /** The movements it touches: 0 means the rule is in the table but touches nothing now. */
  count: number;
  cents: number;
}

/** The sums that add up another row. */
const parentsOf = (layout: StatementSpec[]) =>
  layout.flatMap((spec) => (spec.kind === "sum" ? spec.of.map((row) => ({ row, parent: spec })) : []));

/**
 * What to check in the statement of these movements. Some are rules of the table itself (a row without Paypal, a row
 * in no total): they are always listed, with `count` 0 when they touch nothing. The others exist only if the
 * movements have them (no Voce, a Voce no row reads, a wrong sign).
 */
export function statementIssues(entries: StatementEntry[], layout: StatementSpec[], rows: StatementRow[]): StatementIssue[] {
  const rowOf = new Map(rows.map((r) => [r.row, r]));
  const issue = (kind: StatementIssueKind, row: StatementRow, extra: Partial<StatementIssue> = {}): StatementIssue => ({
    kind, row: row.row, label: row.label, count: row.count, cents: row.cents ?? 0, ...extra,
  });

  const read = new Set(layout.flatMap((s) => (s.kind === "voce" ? [voceKey(s.label)] : [])));
  const unread = new Map<string, StatementIssue>();
  for (const e of entries) {
    if (e.voce === null || read.has(voceKey(e.voce))) continue;
    const key = voceKey(e.voce);
    const now = unread.get(key) ?? { kind: "unknownVoce" as const, row: null, label: e.voce, count: 0, cents: 0 };
    unread.set(key, { ...now, count: now.count + 1, cents: now.cents + e.cents });
  }
  const none = entries.filter((e) => e.voce === null);

  const paypalLeftOut = layout.flatMap((s) => (s.kind === "voce" && !s.paypal ? [s] : [])).map((s) => {
    const left = entries.filter((e) => e.account === "paypal" && e.voce !== null && voceKey(e.voce) === voceKey(s.label));
    return issue("paypalLeftOut", rowOf.get(s.row)!, { count: left.length, cents: left.reduce((sum, e) => sum + e.cents, 0) });
  });
  const added = new Set(parentsOf(layout).map((p) => p.row));
  const outside = layout.flatMap((s) => (s.kind === "voce" && !added.has(s.row) ? [issue("outsideTotals", rowOf.get(s.row)!)] : []));
  const sections = parentsOf(layout)
    .filter(({ row, parent }) => !parent.total && specOf(layout, row).kind === "sum")
    .map(({ row }) => issue("sectionInSection", rowOf.get(row)!));

  const side = sideOfRows(layout);
  const wrongSign = rows
    .filter((r) => r.cents !== null && r.cents !== 0 && Math.sign(r.cents) === (side.get(r.row) === "in" ? -1 : 1))
    .map((r) => issue("wrongSign", r));

  return [
    ...(none.length > 0 ? [{ kind: "noVoce" as const, row: null, label: "", count: none.length, cents: none.reduce((s, e) => s + e.cents, 0) }] : []),
    ...unread.values(),
    ...paypalLeftOut, ...outside, ...sections,
    ...wrongSign,
  ];
}

const specOf = (layout: StatementSpec[], row: number) => layout.find((s) => s.row === row)!;

/** Which side each row is on: the one of the last title above it. */
function sideOfRows(layout: StatementSpec[]): Map<number, "in" | "out"> {
  const sides = new Map<number, "in" | "out">();
  let side: "in" | "out" = "in";
  for (const spec of layout) {
    if (spec.kind === "title") side = spec.side;
    sides.set(spec.row, side);
  }
  return sides;
}
