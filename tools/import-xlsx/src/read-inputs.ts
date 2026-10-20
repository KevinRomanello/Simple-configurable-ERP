import ExcelJS from "exceljs";
import { bool, fill, isoDate, num, str } from "./cells";

// Reads only what a person typed into the sheet. Everything calculated (net, VAT, totals,
// summaries) is ignored here: the engine recomputes it, and read-oracle.ts reads the sheet's own
// copy of it to compare.

export const AREA_SHEETS = ["MT + DMT", "SW", "HW", "CM", "MGT", "RT"] as const;

export interface RawFigures {
  quantity: number | null;
  unitCost: number | null;
  /** The sheet's 9-way dropdown, e.g. "Partially sponsorized with VAT (22%)". */
  sponsorOption: string | null;
  sponsorValue: number | null;
  fund: string | null;
  supplier: string | null;
  purchaseDate: string | null;
  arrivalDate: string | null;
}

export interface RawLine {
  sheetRow: number;
  item: string;
  category: string | null;
  priority: string | null;
  note: string | null;
  estimate: RawFigures;
  actual: RawFigures;
}

export interface RawProject {
  name: string;
  ownerName: string | null;
  lines: RawLine[];
  /** The yellow subtotal row of the project (the VAT report of the sheet is laid out on it). */
  subtotalRow: number;
}

export interface RawArea {
  name: string;
  projects: RawProject[];
}

export interface RawMoneyRow {
  name: string;
  amount: number;
  date: string | null;
}

export interface RawInputs {
  areas: RawArea[];
  /** The CASH FROM contract tables. */
  contracts: { estimate: RawMoneyRow[]; actual: RawMoneyRow[] };
  /** The "DOES IT PAY VAT?" checkboxes of the CASH FROM summaries, by fund name. */
  paysVat: { estimate: Map<string, boolean>; actual: Map<string, boolean> };
  /** The CASH FLOW inflow tables. */
  inflows: { estimate: RawMoneyRow[]; actual: RawMoneyRow[] };
  suppliers: { estimate: string[]; actual: string[] };
  bank: { amount: number; date: string | null } | null;
  warnings: string[];
}

const YELLOW = new Set(["FFFFFF00", "FFF3FF14"]);

// Column numbers of the area sheets (A = 1). Estimate and actual blocks have the same shape.
const COL = {
  project: 1, item: 2, category: 3, priority: 4, note: 29,
  estimate: { qty: 5, unit: 6, fund: 9, supplier: 10, option: 11, sponsor: 13, purchase: 15, arrival: 16 },
  actual: { qty: 17, unit: 18, fund: 21, supplier: 22, option: 23, sponsor: 25, purchase: 27, arrival: 28 },
} as const;

type FigureColumns = Record<"qty" | "unit" | "fund" | "supplier" | "option" | "sponsor" | "purchase" | "arrival", number>;

function readFigures(sheet: ExcelJS.Worksheet, row: number, c: FigureColumns): RawFigures {
  return {
    quantity: num(sheet, row, c.qty),
    unitCost: num(sheet, row, c.unit),
    sponsorOption: str(sheet, row, c.option),
    sponsorValue: num(sheet, row, c.sponsor),
    fund: str(sheet, row, c.fund),
    supplier: str(sheet, row, c.supplier),
    purchaseDate: isoDate(sheet, row, c.purchase),
    arrivalDate: isoDate(sheet, row, c.arrival),
  };
}

/** Priorities were numbers 1-3 in an older version of the sheet. */
function priorityOf(sheet: ExcelJS.Worksheet, row: number): string | null {
  const text = str(sheet, row, COL.priority);
  if (text === null) return null;
  return { "1": "High", "2": "Medium", "3": "Low" }[text] ?? text;
}

/**
 * An area sheet is a stack of blocks. A block starts after a yellow row (or at the top), carries
 * the project name in column A of its first row, and ends with a yellow subtotal row whose
 * column A holds the project's owner.
 */
function readArea(sheet: ExcelJS.Worksheet, warnings: string[]): RawArea {
  const projects: RawProject[] = [];
  let name: string | null = null;
  let lines: RawLine[] = [];

  const close = (owner: string | null, subtotalRow: number) => {
    if (name !== null || lines.length > 0) {
      projects.push({ name: name ?? `Project ${projects.length + 1}`, ownerName: owner, lines, subtotalRow });
    }
    name = null;
    lines = [];
  };

  for (let row = 2; row <= sheet.rowCount; row++) {
    const first = str(sheet, row, COL.project);
    if (first?.toUpperCase() === "TOTAL") break;

    const background = fill(sheet, row, 7);
    if (background !== null && YELLOW.has(background)) {
      close(first, row);
      continue;
    }
    if (first !== null && name === null) name = first;

    const item = str(sheet, row, COL.item);
    if (item === null) continue;
    lines.push({
      sheetRow: row,
      item,
      category: str(sheet, row, COL.category),
      priority: priorityOf(sheet, row),
      note: str(sheet, row, COL.note),
      estimate: readFigures(sheet, row, COL.estimate),
      actual: readFigures(sheet, row, COL.actual),
    });
  }
  if (lines.length > 0) {
    warnings.push(`${sheet.name}: items after the last yellow row were kept in a project of their own`);
    close(null, 0);
  }
  return { name: sheet.name, projects };
}

/** Rows 8.. of CASH FROM / CASH FLOW up to the "EXPECTED SUMMARY" label are the input tables. */
function summaryRowOf(sheet: ExcelJS.Worksheet): number {
  for (let row = 8; row <= sheet.rowCount; row++) {
    if (str(sheet, row, 1)?.toUpperCase() === "EXPECTED SUMMARY") return row;
  }
  return sheet.rowCount + 1;
}

function readMoneyTable(sheet: ExcelJS.Worksheet, nameCol: number): RawMoneyRow[] {
  const rows: RawMoneyRow[] = [];
  const end = summaryRowOf(sheet);
  for (let row = 8; row < end; row++) {
    const name = str(sheet, row, nameCol);
    if (name === null) continue;
    rows.push({ name, amount: num(sheet, row, nameCol + 1) ?? 0, date: isoDate(sheet, row, nameCol + 2) });
  }
  return rows;
}

/** The summary rows under "CASH SOURCE": name in `nameCol`, the VAT checkbox `offset` columns on. */
function readPaysVat(sheet: ExcelJS.Worksheet, nameCol: number, boxCol: number): Map<string, boolean> {
  const flags = new Map<string, boolean>();
  for (let row = summaryRowOf(sheet) + 2; row <= sheet.rowCount; row++) {
    const name = str(sheet, row, nameCol);
    if (name === null || name.toUpperCase().endsWith("DATE SUMMARY")) break;
    flags.set(name, bool(sheet, row, boxCol) === true);
  }
  return flags;
}

function readNames(sheet: ExcelJS.Worksheet, col: number): string[] {
  const names: string[] = [];
  for (let row = 8; row <= sheet.rowCount; row++) {
    const name = str(sheet, row, col);
    if (name !== null) names.push(name);
  }
  return names;
}

export async function openWorkbook(path: string): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  return workbook;
}

export function sheetOf(workbook: ExcelJS.Workbook, name: string): ExcelJS.Worksheet {
  const found = workbook.getWorksheet(name);
  if (!found) throw new Error(`Sheet "${name}" not found`);
  return found;
}

export function readInputs(workbook: ExcelJS.Workbook): RawInputs {
  const sheet = (name: string) => sheetOf(workbook, name);

  const warnings: string[] = [];
  const cashFrom = sheet("CASH FROM");
  const cashFlow = sheet("CASH FLOW");
  const bought = sheet("BOUGHT FROM");

  const bankAmount = num(cashFlow, 14, 13);
  return {
    areas: AREA_SHEETS.map((name) => readArea(sheet(name), warnings)),
    contracts: { estimate: readMoneyTable(cashFrom, 1), actual: readMoneyTable(cashFrom, 7) },
    paysVat: { estimate: readPaysVat(cashFrom, 1, 4), actual: readPaysVat(cashFrom, 7, 10) },
    inflows: { estimate: readMoneyTable(cashFlow, 1), actual: readMoneyTable(cashFlow, 7) },
    suppliers: { estimate: readNames(bought, 2), actual: readNames(bought, 6) },
    bank: bankAmount === null ? null : { amount: bankAmount, date: isoDate(cashFlow, 14, 14) },
    warnings,
  };
}
