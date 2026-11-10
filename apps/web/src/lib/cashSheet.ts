import type { CellValue, Workbook, Worksheet } from "exceljs";
import type { CashAccount } from "../api/types";

// Reading the sheet of the treasury ("2026_Registro cassa.xlsx") in the browser: what the rows of its
// sheet "movimenti cassa e banca" say, as plain data for the API. Formulas are not followed (the
// balances are worked out again by the site); their saved results are only used to check them.
// docs/registro-di-cassa.md

export interface SheetRow {
  /** The row of the sheet, to say where a problem is. */
  row: number;
  on: string;
  description: string;
  category: string | null;
  method: string | null;
  invoiceChecked: boolean;
  account: CashAccount;
  /** Positive for money in, negative for money out. */
  cents: number;
}

export interface SheetProblem {
  row: number;
  message: string;
}

/** The first row where the balance saved in the sheet is not the one its own movements give. */
export interface BalanceMismatch {
  account: CashAccount;
  row: number;
  sheetCents: number;
  computedCents: number;
}

export interface SheetRead {
  sheetName: string;
  /** The row of the opening balances ("saldo al 01/01/2025"). */
  opening: { label: string | null; cents: Record<CashAccount, number> } | null;
  rows: SheetRow[];
  /** Rows that were read but cannot be a movement; they are left out. */
  problems: SheetProblem[];
  mismatches: BalanceMismatch[];
  /** Rows with nothing in them (the formulas dragged down the sheet). */
  emptyRows: number;
  /** Text written beside the table, which is not data. */
  notes: string[];
}

export const REGISTER_SHEET = "movimenti cassa e banca";
const ACCOUNTS_IN_ORDER: CashAccount[] = ["cash", "bank", "paypal"];

type Plain = string | number | boolean | Date | null;

/** What a cell shows: the saved result of a formula, the text of a link or a rich text. */
function plain(value: CellValue | undefined): Plain {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value !== "object") return value;
  if ("result" in value) return plain(value.result as CellValue);
  if ("richText" in value) return value.richText.map((part) => part.text).join("");
  if ("text" in value) return String(value.text);
  return null;
}

const text = (value: Plain): string => (value === null || value instanceof Date ? "" : String(value).trim());
const key = (value: Plain) => text(value).toLowerCase().replace(/\s+/g, " ");

/** A day as YYYY-MM-DD: a date cell, a text written as 2026-01-02 or as 02/01/2026. */
export function dayOf(value: Plain): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const written = text(value);
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(written);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const italian = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(written);
  return italian ? `${italian[3]}-${italian[2]!.padStart(2, "0")}-${italian[1]!.padStart(2, "0")}` : null;
}

/** Euros as written in the sheet to cents; null when it is not a number or has more than two decimals. */
export function centsOf(value: number): number | null {
  const cents = Math.round(value * 100);
  return Math.abs(value * 100 - cents) < 1e-6 ? cents : null;
}

interface Columns {
  header: number;
  on: number;
  description: number;
  category: number;
  method: number;
  invoice: number;
  last: number;
  accounts: { account: CashAccount; in: number; out: number; balance: number }[];
}

/** The columns by their headings (Data, Descrizione, Voce... and the Entrate / Uscite / Progressivo of each account). */
function findColumns(sheet: Worksheet): Columns | null {
  for (let r = 1; r <= Math.min(30, sheet.rowCount); r++) {
    const headings = new Map<number, string>();
    for (let c = 1; c <= sheet.columnCount; c++) {
      const heading = key(plain(sheet.getRow(r).getCell(c).value));
      if (heading !== "") headings.set(c, heading);
    }
    const at = (name: string) => [...headings.entries()].find(([, h]) => h === name)?.[0];
    const on = at("data");
    const description = at("descrizione");
    if (on === undefined || description === undefined) continue;
    const groups = [...headings.entries()].filter(([, h]) => h === "entrate").map(([c]) => c);
    const label = (c: number): CashAccount | undefined => {
      const above = key(plain(sheet.getRow(r - 1).getCell(c).value));
      return above.includes("cassa") ? "cash" : above.includes("banca") ? "bank" : above.includes("paypal") ? "paypal" : undefined;
    };
    return {
      header: r,
      on,
      description,
      category: at("voce") ?? 0,
      method: at("metodo di pagamento") ?? 0,
      invoice: at("check fattura") ?? 0,
      last: Math.max(...headings.keys()),
      accounts: groups.map((c, i) => ({ account: label(c) ?? ACCOUNTS_IN_ORDER[i] ?? "paypal", in: c, out: c + 1, balance: c + 2 })),
    };
  }
  return null;
}

/** The movements of a sheet of the register. Null if the sheet has no heading with Data and Descrizione. */
export function readRegisterSheet(sheet: Worksheet): SheetRead | null {
  const cols = findColumns(sheet);
  if (!cols) return null;
  const read: SheetRead = { sheetName: sheet.name, opening: null, rows: [], problems: [], mismatches: [], emptyRows: 0, notes: [] };
  const running: Record<CashAccount, number> = { cash: 0, bank: 0, paypal: 0 };

  for (let r = cols.header + 1; r <= sheet.rowCount; r++) {
    const line = sheet.getRow(r);
    const value = (_row: number, c: number) => (c > 0 ? plain(line.getCell(c).value) : null);
    // text beside the table is a note of the person who keeps the sheet, not data
    line.eachCell({ includeEmpty: false }, (cell, c) => {
      const note = c > cols.last ? text(plain(cell.value)) : "";
      if (note !== "" && read.notes.length < 30) read.notes.push(`${cell.address}: ${note.slice(0, 200)}`);
    });

    const on = dayOf(value(r, cols.on));
    const description = text(value(r, cols.description));
    const amounts = cols.accounts.map((a) => ({ ...a, in: value(r, a.in), out: value(r, a.out) }));
    const hasAmount = amounts.some((a) => [a.in, a.out].some((v) => v !== null && text(v) !== ""));
    const category = text(value(r, cols.category));

    if (on === null && /^saldo/i.test(description) && read.opening === null) {
      const cents = { cash: 0, bank: 0, paypal: 0 };
      for (const a of cols.accounts) {
        const saved = value(r, a.balance);
        cents[a.account] = typeof saved === "number" ? (centsOf(saved) ?? 0) : 0;
      }
      read.opening = { label: description, cents };
      Object.assign(running, cents);
      continue;
    }
    if (on === null && description === "" && category === "" && !hasAmount) {
      read.emptyRows += 1;
      continue;
    }
    const problem = (message: string) => read.problems.push({ row: r, message });
    if (on === null) {
      problem("The movement has no date");
      continue;
    }

    const used: { account: CashAccount; cents: number }[] = [];
    let unreadable = false;
    for (const a of amounts) {
      for (const [side, v] of [["in", a.in], ["out", a.out]] as const) {
        if (v === null || text(v) === "") continue;
        const cents = typeof v === "number" ? centsOf(v) : null;
        if (cents === null) {
          problem(`The ${side === "in" ? "Entrate" : "Uscite"} of ${a.account} is not a number with at most two decimals`);
          unreadable = true;
        } else if (cents !== 0) {
          used.push({ account: a.account, cents: side === "in" ? cents : -cents });
        }
      }
    }
    if (unreadable) continue;
    if (used.length === 0) {
      problem("The movement has no amount");
      continue;
    }
    if (used.length > 1) {
      problem("The movement has more than one amount (two accounts, or money in and out together)");
      continue;
    }

    const { account, cents } = used[0]!;
    running[account] += cents;
    read.rows.push({
      row: r,
      on,
      description: description.slice(0, 2_000),
      category: category === "" ? null : category,
      method: text(value(r, cols.method)) === "" ? null : text(value(r, cols.method)),
      invoiceChecked: value(r, cols.invoice) === true,
      account,
      cents,
    });
    // the balance the sheet saved against the one its own movements give, the first time they part
    for (const a of cols.accounts) {
      const saved = value(r, a.balance);
      if (typeof saved !== "number" || read.mismatches.some((m) => m.account === a.account)) continue;
      const sheetCents = centsOf(saved);
      if (sheetCents !== null && sheetCents !== running[a.account]) read.mismatches.push({ account: a.account, row: r, sheetCents, computedCents: running[a.account] });
    }
  }
  return read;
}

/** The sheet of the register in a file: the one called "movimenti cassa e banca", else the first that has the headings. */
export async function readRegisterFile(file: Blob): Promise<SheetRead> {
  const module = await import("exceljs");
  const ExcelJS = module.default ?? module;
  const workbook: Workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheets = [...workbook.worksheets].sort((a, b) => Number(b.name.toLowerCase() === REGISTER_SHEET) - Number(a.name.toLowerCase() === REGISTER_SHEET));
  for (const sheet of sheets) {
    const found = readRegisterSheet(sheet);
    if (found) return found;
  }
  throw new Error('No sheet of this file has the headings of the register (Data, Descrizione, Voce, Entrate, Uscite...). Is it the sheet "movimenti cassa e banca"?');
}
