import { financialStatement, type StatementEntry } from "@erp/calc";
import { getStatementLayout } from "@erp/api/lookups";
import ExcelJS, { type CellValue } from "exceljs";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The financial statement against the real sheet of the treasury: in fonti/ (not in git, real data), so it is skipped when
// the folder is not there. Nothing of the sheet is copied here: the test reads it and compares. docs/registro-di-cassa.md
const REAL = new URL("../../../fonti/2026_Registro cassa.xlsx", import.meta.url);

/** What a cell shows: the saved result of a formula. */
function shown(value: CellValue | undefined): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && "result" in value) return shown(value.result as CellValue);
  if (typeof value === "object" && "richText" in value) return value.richText.map((p) => p.text).join("");
  return typeof value === "string" || typeof value === "number" ? value : null;
}

/** The columns of the register that hold money, and the account and the sign of each. */
const MONEY_COLUMNS: { column: string; account: StatementEntry["account"]; sign: 1 | -1 }[] = [
  { column: "F", account: "cash", sign: 1 }, { column: "G", account: "cash", sign: -1 },
  { column: "I", account: "bank", sign: 1 }, { column: "J", account: "bank", sign: -1 },
  { column: "L", account: "paypal", sign: 1 }, { column: "M", account: "paypal", sign: -1 },
];

/** Every amount of the sheet that has a Voce, read straight from the columns the sheet's own SUMIF reads. */
function entriesOf(sheet: ExcelJS.Worksheet): StatementEntry[] {
  const entries: StatementEntry[] = [];
  sheet.eachRow((row) => {
    const voce = shown(row.getCell("C").value);
    if (typeof voce !== "string" || voce.trim() === "") return;
    for (const { column, account, sign } of MONEY_COLUMNS) {
      const amount = shown(row.getCell(column).value);
      if (typeof amount === "number" && amount !== 0) entries.push({ voce, account, cents: sign * Math.round(amount * 100) });
    }
  });
  return entries;
}

describe.skipIf(!existsSync(REAL))("the financial statement against the real sheet", () => {
  it("has the same rows, labels and amounts as the sheet 'voci di ricavocosto', in both columns", async () => {
    const book = new ExcelJS.Workbook();
    await book.xlsx.readFile(fileURLToPath(REAL));
    const sheet = book.getWorksheet("voci di ricavocosto")!;
    const entries = entriesOf(book.getWorksheet("movimenti cassa e banca")!);
    expect(entries.length).toBeGreaterThan(500);

    const rows = financialStatement(entries, await getStatementLayout());
    const compared: number[] = [];
    for (const row of rows) {
      if (row.kind === "blank") continue;
      expect(String(shown(sheet.getCell(`A${row.row}`).value)).trim(), `label of row ${row.row}`).toBe(row.label.trim());
      if (row.kind === "title") continue;
      // the sheet keeps euros as numbers; ours are cents, so compare to the cent
      if (row.cents !== null) expect(Math.round(Number(shown(sheet.getCell(`B${row.row}`).value)) * 100), `column B of row ${row.row}`).toBe(row.cents);
      expect(Math.round(Number(shown(sheet.getCell(`C${row.row}`).value)) * 100), `column C of row ${row.row}`).toBe(row.partialCents);
      compared.push(row.row);
    }
    expect(compared.length).toBe(rows.filter((r) => r.kind !== "blank" && r.kind !== "title").length);
    expect(compared.length).toBeGreaterThan(60);
  }, 60_000);
});
