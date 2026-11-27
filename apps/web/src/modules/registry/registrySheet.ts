import { makeCell } from "../../core/export/table";

// Excel for the registry (docs/anagrafiche.md, §11): the first sheet of a file read as CSV (the import of the
// server takes CSV), and the records of a view written as a sheet. exceljs is loaded only when asked.

const csvCell = (text: string) => (/[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);

/** The first sheet of an Excel file as CSV text: the values as the sheet shows them, dates as YYYY-MM-DD. */
export async function sheetAsCsv(file: File): Promise<string> {
  const module = await import("exceljs");
  const ExcelJS = module.default ?? module;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet) return "";
  const lines: string[] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    for (let col = 1; col <= sheet.columnCount; col++) {
      const value = row.getCell(col).value;
      const text = value instanceof Date ? value.toISOString().slice(0, 10) : value && typeof value === "object" && "text" in value ? String(value.text) : value && typeof value === "object" && "result" in value ? String(value.result ?? "") : value === null || value === undefined ? "" : String(value);
      cells.push(csvCell(text));
    }
    lines.push(cells.join(","));
  });
  return lines.join("\n");
}

/**
 * An Excel file of records: the names of the fields in the first row, a row per record, numbers and dates as
 * real ones. The same file comes back in through the import (the first row names the fields).
 */
export async function recordsAsXlsx(title: string, columns: { name: string; numeric: boolean }[], rows: string[][]): Promise<Blob> {
  const module = await import("exceljs");
  const ExcelJS = module.default ?? module;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "E-Agle TRT";
  const sheet = workbook.addWorksheet(title.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Records");
  sheet.addRow(columns.map((c) => c.name)).font = { bold: true };
  for (const row of rows) {
    const added = sheet.addRow(row.map((text, i) => makeCell(text, { numeric: columns[i]?.numeric }).value ?? text));
    row.forEach((text, i) => {
      const format = makeCell(text, { numeric: columns[i]?.numeric }).format;
      if (format) added.getCell(i + 1).numFmt = format;
    });
  }
  columns.forEach((c, i) => (sheet.getColumn(i + 1).width = Math.min(48, Math.max(10, c.name.length + 2, ...rows.map((r) => (r[i] ?? "").length + 2)))));
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
