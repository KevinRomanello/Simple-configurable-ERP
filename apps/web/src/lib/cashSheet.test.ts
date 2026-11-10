import ExcelJS from "exceljs";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { centsOf, dayOf, readRegisterFile, readRegisterSheet } from "./cashSheet";

/** A workbook laid out like the sheet of the treasury, with invented rows. */
function workbook(build: (sheet: ExcelJS.Worksheet) => void, name = "movimenti cassa e banca") {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(name);
  sheet.getRow(1).getCell(1).value = "Registro delle movimentazioni della liquidità";
  ["Cassa", "Banca", "Paypal"].forEach((label, i) => (sheet.getRow(2).getCell(6 + i * 3).value = label));
  const heading = ["Data", "Descrizione", "Voce", "Metodo di pagamento", "Check fattura", "Entrate", "Uscite", "Progressivo", "Entrate", "Uscite", "Progressivo", "Entrate", "Uscite", "Progressivo", "Progressivo cumulato"];
  heading.forEach((h, i) => (sheet.getRow(3).getCell(i + 1).value = h));
  sheet.getRow(4).getCell(2).value = "saldo al 01/01/2026";
  sheet.getRow(4).getCell(8).value = 385;
  sheet.getRow(4).getCell(11).value = 60_599.26;
  build(sheet);
  return book;
}

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const put = (sheet: ExcelJS.Worksheet, r: number, cells: Record<number, ExcelJS.CellValue>) => Object.entries(cells).forEach(([c, v]) => (sheet.getRow(r).getCell(Number(c)).value = v));

describe("readRegisterSheet", () => {
  it("reads the opening balances and the movements, each on its one account, money out as negative", () => {
    const book = workbook((s) => {
      put(s, 5, { 1: day("2026-01-02"), 2: "Bollo", 3: "8.2 Imposta di bollo", 4: "Automatico", 5: false, 10: 8.51 });
      put(s, 6, { 1: day("2026-01-12"), 2: "Vendita", 3: "2.1 da soci e tesserati", 5: true, 6: 25 });
      put(s, 7, { 1: day("2026-01-13"), 2: "Paypal sale", 12: 28, 13: 0.34 });
    });
    const read = readRegisterSheet(book.getWorksheet("movimenti cassa e banca")!)!;
    expect(read.opening).toEqual({ label: "saldo al 01/01/2026", cents: { cash: 38_500, bank: 6_059_926, paypal: 0 } });
    expect(read.problems).toEqual([{ row: 7, message: "The movement has more than one amount (two accounts, or money in and out together)" }]);
    expect(read.rows).toEqual([
      { row: 5, on: "2026-01-02", description: "Bollo", category: "8.2 Imposta di bollo", method: "Automatico", invoiceChecked: false, account: "bank", cents: -851 },
      { row: 6, on: "2026-01-12", description: "Vendita", category: "2.1 da soci e tesserati", method: null, invoiceChecked: true, account: "cash", cents: 2_500 },
    ]);
  });

  it("finds the columns by their headings, whatever order the groups of accounts come in", () => {
    const book = workbook((s) => {
      ["Banca", "Cassa", "Paypal"].forEach((label, i) => (s.getRow(2).getCell(6 + i * 3).value = label));
      put(s, 5, { 1: day("2026-03-01"), 2: "In the bank", 6: 100 });
    });
    expect(readRegisterSheet(book.getWorksheet("movimenti cassa e banca")!)!.rows[0]!.account).toBe("bank");
  });

  it("ignores the rows with nothing but formulas, and counts them", () => {
    const book = workbook((s) => {
      put(s, 5, { 1: day("2026-01-02"), 2: "A", 6: 1 });
      put(s, 6, { 5: false, 8: { formula: "H5", result: 1 } });
      put(s, 7, { 5: false });
    });
    const read = readRegisterSheet(book.getWorksheet("movimenti cassa e banca")!)!;
    expect(read.rows).toHaveLength(1);
    expect(read.emptyRows).toBe(2);
  });

  it("does not follow formulas but reads their saved results, and tells where a balance stops matching its movements", () => {
    const book = workbook((s) => {
      put(s, 5, { 1: day("2026-01-02"), 2: "A", 10: { formula: "J5", result: 10 }, 11: { formula: "K4+I5-J5", result: 60_589.26 } });
      put(s, 6, { 1: day("2026-01-03"), 2: "B", 10: 5, 11: { formula: "K5+I6-J6", result: 60_580.26 } }); // should be 60584.26
      put(s, 7, { 1: day("2026-01-04"), 2: "C", 6: 3, 8: { formula: "H6+F7-G7", result: 388 } });
    });
    const read = readRegisterSheet(book.getWorksheet("movimenti cassa e banca")!)!;
    expect(read.rows.map((r) => r.cents)).toEqual([-1_000, -500, 300]);
    expect(read.mismatches).toEqual([{ account: "bank", row: 6, sheetCents: 6_058_026, computedCents: 6_058_426 }]);
  });

  it("puts what cannot be a movement among the problems, with its row: no date, no amount, words in the amount, three decimals", () => {
    const book = workbook((s) => {
      put(s, 5, { 2: "No date", 6: 1 });
      put(s, 6, { 1: day("2026-01-02"), 2: "No amount" });
      put(s, 7, { 1: day("2026-01-02"), 2: "Words", 10: "108+58" });
      put(s, 8, { 1: day("2026-01-02"), 2: "Decimals", 10: 1.005 });
      put(s, 9, { 1: "03/01/2026", 2: "Written date", 10: 2 });
    });
    const read = readRegisterSheet(book.getWorksheet("movimenti cassa e banca")!)!;
    expect(read.problems.map((p) => p.row)).toEqual([5, 6, 7, 8]);
    expect(read.rows.map((r) => [r.row, r.on])).toEqual([[9, "2026-01-03"]]);
  });

  it("keeps the notes written beside the table apart, as notes", () => {
    const book = workbook((s) => {
      put(s, 5, { 1: day("2026-01-02"), 2: "A", 6: 1, 17: "domande:", 18: "a note" });
    });
    expect(readRegisterSheet(book.getWorksheet("movimenti cassa e banca")!)!.notes).toEqual(["Q5: domande:", "R5: a note"]);
  });

  it("is not a sheet of the register without the headings", () => {
    const book = new ExcelJS.Workbook();
    book.addWorksheet("other").getRow(1).getCell(1).value = "Something else";
    expect(readRegisterSheet(book.getWorksheet("other")!)).toBeNull();
  });
});

describe("dayOf and centsOf", () => {
  it("read dates written three ways, and euros exactly", () => {
    expect(dayOf(day("2026-01-02"))).toBe("2026-01-02");
    expect(dayOf("2026-01-02")).toBe("2026-01-02");
    expect(dayOf("2/1/2026")).toBe("2026-01-02");
    expect(dayOf("not a date")).toBeNull();
    expect(centsOf(60_599.26)).toBe(6_059_926);
    expect(centsOf(0.1 + 0.2)).toBe(30);
    expect(centsOf(1.005)).toBeNull();
  });
});

describe("readRegisterFile", () => {
  it("reads a file: the sheet called 'movimenti cassa e banca' wins over another with the same headings", async () => {
    const book = workbook((s) => put(s, 5, { 1: day("2026-01-02"), 2: "Right", 6: 1 }), "movimenti cassa e banca");
    const copy = book.addWorksheet("Task tesoreria");
    ["Data", "Descrizione", "Entrate", "Uscite"].forEach((h, i) => (copy.getRow(1).getCell(i + 1).value = h));
    put(copy, 2, { 1: day("2026-02-02"), 2: "Wrong", 3: 1 });
    const read = await readRegisterFile(new Blob([await book.xlsx.writeBuffer()]));
    expect(read.sheetName).toBe("movimenti cassa e banca");
    expect(read.rows.map((r) => r.description)).toEqual(["Right"]);
  });

  it("says so when no sheet of the file is a register", async () => {
    const book = new ExcelJS.Workbook();
    book.addWorksheet("x").getRow(1).getCell(1).value = "nothing";
    await expect(readRegisterFile(new Blob([await book.xlsx.writeBuffer()]))).rejects.toThrow(/movimenti cassa e banca/);
  });
});

// The real sheet of the treasury: in fonti/ (not in git); skipped when it is not there.
const REAL = new URL("../../../../fonti/2026_Registro cassa.xlsx", import.meta.url);
describe.skipIf(!existsSync(REAL))("the real sheet of the treasury", () => {
  it("is read without a single problem, and its Cassa and Banca balances are the ones the sheet saved", async () => {
    const { readFile } = await import("node:fs/promises");
    const read = await readRegisterFile(new Blob([await readFile(REAL)]));
    expect(read.sheetName).toBe("movimenti cassa e banca");
    expect(read.rows.length).toBeGreaterThan(700);
    expect(read.problems).toEqual([]);
    expect(read.opening).not.toBeNull();
    // Cassa and Banca follow the saved balances all the way; only Paypal parts from them (a formula of the sheet)
    expect(read.mismatches.map((m) => m.account)).toEqual(["paypal"]);
  }, 60_000);
});
