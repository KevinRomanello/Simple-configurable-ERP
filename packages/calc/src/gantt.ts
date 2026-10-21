import { isAfterBank } from "./bank";
import { ALL_BLOCK, blocksOf } from "./blocks";
import { bankInflows, cashSponsorVat } from "./cash";
import { monthKey, monthRange, monthSpan } from "./dates";
import { computeLines, type CalcLine } from "./lines";
import type { Snapshot } from "./snapshot";
import type { Phase } from "./types";

/** Cents per month key ("2026-11"). */
export type ByMonth = Record<string, number>;

export interface GanttRow {
  /** Null for the "VAT Outflow" row that collects the VAT the team pays in each area. */
  projectId: number | null;
  name: string;
  byMonth: ByMonth;
  sumCents: number;
}

export interface GanttArea {
  areaCode: string;
  areaName: string;
  rows: GanttRow[];
  /** "Monthly sum <area>" of the old sheet. */
  monthlySum: ByMonth;
  sumCents: number;
}

export interface GanttBlock {
  block: string;
  areas: GanttArea[];
  total: { byMonth: ByMonth; sumCents: number };
}

export interface TeamFundRow {
  month: string;
  inflowCents: number;
  /** Purchases paid from the team fund (VAT excluded) plus the VAT the team pays (also on cash sponsors' money). */
  outflowAllCents: number;
  outflowByCategory: Record<string, number>;
  outflowVatCents: number;
  /** Running balance; null before the month of the BANK balance. */
  finalCents: number | null;
}

export interface Gantt {
  phase: Phase;
  months: string[];
  /** Blocks without any movement are left out. */
  blocks: GanttBlock[];
  teamFund: { categories: string[]; rows: TeamFundRow[] };
}

/** A cash movement of one line: the purchase on its date, or the VAT on its deadline. */
interface Movement {
  line: CalcLine;
  kind: "purchase" | "vat";
  date: string;
  month: string;
  cents: number;
  /** The part of a purchase paid from the team fund (VAT excluded); zero for a VAT movement. */
  teamFundCents: number;
}

const VAT_ROW_NAME = "VAT Outflow";

function movementsOf(lines: CalcLine[], phase: Phase): Movement[] {
  const movements: Movement[] = [];
  for (const line of lines) {
    const p = line[phase];
    // A line without a purchase date is not on the timeline at all.
    if (p.purchaseDate) {
      // When the team pays the VAT it leaves later, on the deadline: only the rest goes out now.
      const cents = p.teamVatCents > 0 ? p.amounts.outflowCents - p.teamVatCents : p.amounts.outflowCents;
      movements.push({
        line,
        kind: "purchase",
        date: p.purchaseDate,
        month: monthKey(p.purchaseDate),
        cents,
        teamFundCents: p.teamFundCents,
      });
    }
    if (p.teamVatCents > 0 && p.vatDueDate) {
      movements.push({
        line,
        kind: "vat",
        date: p.vatDueDate,
        month: monthKey(p.vatDueDate),
        cents: p.teamVatCents,
        teamFundCents: 0,
      });
    }
  }
  return movements;
}

function add(target: ByMonth, month: string, cents: number) {
  target[month] = (target[month] ?? 0) + cents;
}

function sum(byMonth: ByMonth): number {
  return Object.values(byMonth).reduce((a, b) => a + b, 0);
}

function buildBlock(snapshot: Snapshot, block: string, movements: Movement[]): GanttBlock | null {
  const mine = movements.filter((m) => block === ALL_BLOCK || m.line.category === block);
  if (mine.length === 0) return null;

  const areas: GanttArea[] = [];
  for (const area of snapshot.areas) {
    const inArea = mine.filter((m) => m.line.areaId === area.id);
    if (inArea.length === 0) continue;

    // One row per project with a dated purchase, in project order; the VAT row goes last.
    const rows: GanttRow[] = [];
    for (const m of inArea.filter((m) => m.kind === "purchase")) {
      let row = rows.find((r) => r.projectId === m.line.projectId);
      if (!row) {
        row = { projectId: m.line.projectId, name: m.line.projectName, byMonth: {}, sumCents: 0 };
        rows.push(row);
      }
      add(row.byMonth, m.month, m.cents);
    }
    const vat = inArea.filter((m) => m.kind === "vat");
    if (vat.length > 0) {
      const row: GanttRow = { projectId: null, name: VAT_ROW_NAME, byMonth: {}, sumCents: 0 };
      for (const m of vat) add(row.byMonth, m.month, m.cents);
      rows.push(row);
    }

    const monthlySum: ByMonth = {};
    for (const row of rows) {
      row.sumCents = sum(row.byMonth);
      for (const [month, cents] of Object.entries(row.byMonth)) add(monthlySum, month, cents);
    }
    areas.push({
      areaCode: area.code,
      areaName: area.name,
      rows,
      monthlySum,
      sumCents: sum(monthlySum),
    });
  }

  const totalByMonth: ByMonth = {};
  for (const area of areas) {
    for (const [month, cents] of Object.entries(area.monthlySum)) add(totalByMonth, month, cents);
  }
  return { block, areas, total: { byMonth: totalByMonth, sumCents: sum(totalByMonth) } };
}

/**
 * EXPECTED/ACTUAL GANTT of one phase (rules: docs/regole-script-attuale.md, section 10):
 * outflows per area, project and month, plus the "Team's fund" balance table.
 */
export function gantt(snapshot: Snapshot, phase: Phase): Gantt {
  const lines = computeLines(snapshot);
  const movements = movementsOf(lines, phase);
  const { bank } = snapshot;
  const bankDate = bank?.asOfDate ?? null; // a BANK without a date does not cut the timeline
  const mode = snapshot.lookups.settings.bankCompare.timeline;
  const afterBank = (date: string | null) => bankDate === null || isAfterBank(date, bankDate, mode);

  const inflows = bankInflows(snapshot, phase).filter((i) => i.inflowDate !== null);
  // The VAT on a cash sponsor's money belongs to the team fund, not to a project.
  const sponsorVat = cashSponsorVat(snapshot, phase);

  // The timeline spans every month with a movement, an inflow, or the BANK balance.
  const monthKeys = new Set<string>([
    ...movements.map((m) => m.month),
    ...inflows.map((i) => monthKey(i.inflowDate!)),
    ...sponsorVat.map((v) => monthKey(v.dueDate)),
  ]);
  if (bankDate !== null) monthKeys.add(monthKey(bankDate));
  const span = monthSpan(monthKeys);
  const months = span ? monthRange(span[0], span[1]) : [];

  const blocks = blocksOf(snapshot)
    .map((block) => buildBlock(snapshot, block, movements))
    .filter((b): b is GanttBlock => b !== null);

  // --- Team's fund table -------------------------------------------------------------------
  const categories = snapshot.lookups.categories;
  const counted = movements.filter((m) => afterBank(m.date));
  const bankMonth = bankDate === null ? null : monthKey(bankDate);

  let running = bank !== null && bankDate === null ? bank.amountCents : 0;
  const rows = months.map((month): TeamFundRow => {
    let inflowCents = inflows
      .filter((i) => monthKey(i.inflowDate!) === month && afterBank(i.inflowDate))
      .reduce((total, i) => total + i.amountCents, 0);
    if (bank && bankMonth === month) inflowCents += bank.amountCents;

    const inMonth = counted.filter((m) => m.month === month);
    const purchases = inMonth.filter((m) => m.kind === "purchase" && m.teamFundCents > 0);
    const outflowVatCents =
      inMonth.filter((m) => m.kind === "vat").reduce((total, m) => total + m.cents, 0) +
      sponsorVat
        .filter((v) => monthKey(v.dueDate) === month && afterBank(v.dueDate))
        .reduce((total, v) => total + v.cents, 0);
    const outflowAllCents = purchases.reduce((total, m) => total + m.teamFundCents, 0) + outflowVatCents;

    const outflowByCategory = Object.fromEntries(
      categories.map((category) => [
        category,
        purchases.filter((m) => m.line.category === category).reduce((total, m) => total + m.teamFundCents, 0),
      ]),
    );

    let finalCents: number | null = null;
    if (bankMonth === null || month >= bankMonth) {
      running += inflowCents - outflowAllCents;
      finalCents = running;
    }
    return { month, inflowCents, outflowAllCents, outflowByCategory, outflowVatCents, finalCents };
  });

  return { phase, months, blocks, teamFund: { categories, rows } };
}
