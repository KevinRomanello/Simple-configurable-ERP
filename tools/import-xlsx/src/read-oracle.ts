import ExcelJS from "exceljs";
import { parseFlexibleDate } from "@erp/calc";
import { num, plain, str } from "./cells";

// The "oracle": the values the Google Sheet itself had calculated and saved in the xlsx. The
// reconciliation compares them with what the engine computes from the same inputs.

/** A date saved as text, as a real date, or as an Excel serial number. */
function dateAt(sheet: ExcelJS.Worksheet, row: number, col: number): string | null {
  const value = plain(sheet.getCell(row, col));
  if (typeof value === "string") return parseFlexibleDate(value);
  if (typeof value === "number") {
    return new Date(Date.UTC(1899, 11, 30) + value * 86_400_000).toISOString().slice(0, 10);
  }
  return null;
}

/** "oct 26" or "'Nov 26" -> "2026-10". */
export function monthFromLabel(label: string): string | null {
  const match = /^'?([A-Za-z]{3})\s+(\d{2})$/.exec(label.trim());
  if (!match) return null;
  const index = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(
    match[1]!.toLowerCase(),
  );
  return index === -1 ? null : `20${match[2]}-${String(index + 1).padStart(2, "0")}`;
}

// --- area sheets: what each line calculated ------------------------------------------------

export interface PhaseOracle {
  net: number | null;
  vat: number | null;
  gross: number | null;
  sponsor: number | null;
  outflow: number | null;
  teamVat: number | null;
  vatDue: string | null;
}

export function lineOracle(sheet: ExcelJS.Worksheet, row: number) {
  const phase = (c: Record<keyof PhaseOracle, number>): PhaseOracle => ({
    net: num(sheet, row, c.net),
    vat: num(sheet, row, c.vat),
    gross: num(sheet, row, c.gross),
    sponsor: num(sheet, row, c.sponsor),
    outflow: num(sheet, row, c.outflow),
    teamVat: num(sheet, row, c.teamVat),
    vatDue: dateAt(sheet, row, c.vatDue),
  });
  return {
    estimate: phase({ net: 7, vat: 8, gross: 12, sponsor: 13, outflow: 14, teamVat: 31, vatDue: 32 }),
    actual: phase({ net: 19, vat: 20, gross: 24, sponsor: 25, outflow: 26, teamVat: 33, vatDue: 34 }),
  };
}

// --- CASH FROM / CASH FLOW summaries ---------------------------------------------------------

function summaryRow(sheet: ExcelJS.Worksheet): number {
  for (let row = 8; row <= sheet.rowCount; row++) {
    if (str(sheet, row, 1)?.toUpperCase() === "EXPECTED SUMMARY") return row;
  }
  throw new Error(`No summary in ${sheet.name}`);
}

/** Left value of every fund in the CASH FROM summary of a phase, by name. */
export function fundBalances(sheet: ExcelJS.Worksheet, nameCol: number, leftCol: number) {
  const balances = new Map<string, number>();
  for (let row = summaryRow(sheet) + 2; row <= sheet.rowCount; row++) {
    const name = str(sheet, row, nameCol);
    if (name === null || name.toUpperCase().endsWith("DATE SUMMARY")) break;
    balances.set(name, num(sheet, row, leftCol) ?? 0);
  }
  return balances;
}

/** The three figures under "TOTAL CASH FLOW | LEFT VALUE | LEFT VALUE - CASH FROM". */
export function cashFlowFigures(sheet: ExcelJS.Worksheet, firstCol: number) {
  const row = summaryRow(sheet) + 2;
  return {
    total: num(sheet, row, firstCol) ?? 0,
    left: num(sheet, row, firstCol + 1) ?? 0,
    leftAfterCoverage: num(sheet, row, firstCol + 2) ?? 0,
  };
}

// --- TOTAL -----------------------------------------------------------------------------------

/** Block k of the TOTAL sheet starts at column 3 (k = 0) or 12 + (k - 1) * 9. */
export const totalColumn = (block: number) => (block === 0 ? 3 : 12 + (block - 1) * 9);

export function totalCells(sheet: ExcelJS.Worksheet, block: number, row: number) {
  const first = totalColumn(block);
  const at = (offset: number) => num(sheet, row, first + offset);
  return {
    values: [0, 1, 2, 3, 4, 5].map((offset) => at(offset) ?? 0),
    outflowVariance: at(6),
    sponsorVariance: at(7),
  };
}

// --- VAT report (columns AK.. of each area sheet) ------------------------------------------------

export function vatReportDeadlines(sheet: ExcelJS.Worksheet): string[] {
  const dates: string[] = [];
  for (let col = 37; col <= sheet.columnCount; col++) {
    const date = dateAt(sheet, 1, col);
    if (date === null) break;
    dates.push(date);
  }
  return dates;
}

export function vatReportRow(sheet: ExcelJS.Worksheet, row: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => num(sheet, row, 37 + i) ?? 0);
}

// --- GANTT sheets -----------------------------------------------------------------------------

export interface GanttOracleArea {
  rows: Map<string, Map<string, number>>; // project name -> month -> euros
  monthlySum: Map<string, number>;
}
export interface GanttOracle {
  months: string[];
  blocks: Map<string, { areas: Map<string, GanttOracleArea>; total: Map<string, number> }>;
  teamFund: { header: string[]; rows: { month: string; values: (number | null)[] }[] } | null;
}

/** Reads the area/project tables and the "Team's fund" table of EXPECTED/ACTUAL GANTT. */
export function readGantt(sheet: ExcelJS.Worksheet, areaNames: string[], categories: string[]): GanttOracle {
  const months: string[] = [];
  let sumCol = 0;
  for (let col = 3; col <= sheet.columnCount; col++) {
    const label = str(sheet, 2, col);
    if (label === null) break;
    const month = monthFromLabel(label);
    if (month === null) {
      sumCol = col; // "Sum project"
      break;
    }
    months.push(month);
  }

  const blockOf = (title: string) =>
    title.toUpperCase() === "ALL ITEMS" ? "ALL" : categories.find((c) => c.toUpperCase() === title.toUpperCase());

  const blocks: GanttOracle["blocks"] = new Map();
  let block: GanttOracle["blocks"] extends Map<string, infer V> ? V | null : never = null;
  let area: GanttOracleArea | null = null;
  // Column A is a merged cell: every row of a block reports the same title, so a block starts
  // only when the title changes.
  let currentTitle: string | null = null;
  const valuesOf = (row: number) => {
    const values = new Map<string, number>();
    months.forEach((month, i) => {
      const value = num(sheet, row, 3 + i);
      if (value !== null && value !== 0) values.set(month, value);
    });
    return values;
  };

  for (let row = 3; row <= sheet.rowCount; row++) {
    const title = str(sheet, row, 1);
    const name = str(sheet, row, 2);
    if (title?.startsWith("CHART DATA")) break; // the data behind the charts follows the tables
    if (title !== null && title !== currentTitle && blockOf(title) !== undefined && name !== null) {
      currentTitle = title;
      block = { areas: new Map(), total: new Map() };
      blocks.set(blockOf(title)!, block);
    }
    if (name === null || block === null) continue;

    if (areaNames.includes(name) && valuesOf(row).size === 0) {
      area = { rows: new Map(), monthlySum: new Map() };
      block.areas.set(name, area);
    } else if (name.startsWith("Monthly sum ") && area !== null) {
      area.monthlySum = valuesOf(row);
    } else if (name === "TOTAL") {
      block.total = valuesOf(row);
    } else if (area !== null && sumCol > 0) {
      area.rows.set(name, valuesOf(row));
    }
  }

  // "Team's fund" table: the title cell sits in row 1, its header in row 2 below it.
  let teamFund: GanttOracle["teamFund"] = null;
  let titleCol = 0;
  for (let col = 3; col <= sheet.columnCount && titleCol === 0; col++) {
    // The title is a merged cell: take its first column.
    if (str(sheet, 1, col) === "Team's fund") titleCol = col;
  }
  if (titleCol > 0 && str(sheet, 2, titleCol) === "MONTH") {
    const header: string[] = [];
    for (let col = titleCol; str(sheet, 2, col) !== null; col++) header.push(str(sheet, 2, col)!);
    const rows: NonNullable<GanttOracle["teamFund"]>["rows"] = [];
    for (let row = 3; row <= sheet.rowCount; row++) {
      const month = monthFromLabel(str(sheet, row, titleCol) ?? "");
      if (month === null) break;
      rows.push({ month, values: header.slice(1).map((_, i) => num(sheet, row, titleCol + 1 + i)) });
    }
    teamFund = { header, rows };
  }

  return { months, blocks, teamFund };
}

// --- CASH FROM / BOUGHT FROM ANALYSES ------------------------------------------------------------

export interface AnalysisOracleRow {
  estimateName: string | null;
  actualName: string | null;
  /** Per block: [estimate gross, sponsor, outflow, actual gross, sponsor, outflow]; null = blank. */
  blocks: (number | null)[][];
}

export function readAnalysis(sheet: ExcelJS.Worksheet, blockCount: number): {
  rows: AnalysisOracleRow[];
  totals: number[][];
} {
  const firstCol = (block: number) => 2 + block * 10;
  const rows: AnalysisOracleRow[] = [];
  for (let row = 3; row <= sheet.rowCount; row++) {
    const estimateName = str(sheet, row, firstCol(0));
    const actualName = str(sheet, row, firstCol(0) + 4);
    if (estimateName === "TOTAL" || (estimateName === null && actualName === null)) break;
    rows.push({
      estimateName,
      actualName,
      blocks: Array.from({ length: blockCount }, (_, b) => {
        const c = firstCol(b);
        return [1, 2, 3, 5, 6, 7].map((offset) => num(sheet, row, c + offset));
      }),
    });
  }
  const totalRow = 3 + rows.length;
  const totals = Array.from({ length: blockCount }, (_, b) =>
    [1, 2, 3, 5, 6, 7].map((offset) => num(sheet, totalRow, firstCol(b) + offset) ?? 0),
  );
  return { rows, totals };
}

// --- CATEGORY ANALYSES -------------------------------------------------------------------------

export function readCategoryAnalysis(sheet: ExcelJS.Worksheet) {
  const rows = [];
  for (let row = 3; row <= sheet.rowCount; row++) {
    const area = str(sheet, row, 1);
    const item = str(sheet, row, 3);
    if (area === null || item === null) continue; // area header rows and the empty tail
    rows.push({
      area,
      project: str(sheet, row, 2),
      item,
      category: str(sheet, row, 4),
      priority: str(sheet, row, 5),
      estimateOutflow: num(sheet, row, 6),
      estimateFund: str(sheet, row, 7),
      estimateSupplier: str(sheet, row, 8),
      estimateDate: dateAt(sheet, row, 9),
      actualOutflow: num(sheet, row, 10),
      actualFund: str(sheet, row, 11),
      actualSupplier: str(sheet, row, 12),
      actualDate: dateAt(sheet, row, 13),
    });
  }
  return {
    filters: { categories: str(sheet, 1, 4), priority: str(sheet, 1, 5), sort: str(sheet, 1, 9) },
    rows,
  };
}
