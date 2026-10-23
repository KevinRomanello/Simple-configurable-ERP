import type { Worksheet } from "exceljs";
import { chartPicture } from "./chart";
import { sheetName } from "./files";
import { place, type Cell, type Table } from "./table";
import type { Resolved } from "./types";

const FILL: Record<NonNullable<Cell["fill"]>, string> = {
  head: "FF464646",
  band: "FFF3FF17",
  total: "FFE6E6E6",
};
const THIN = { style: "thin" as const, color: { argb: "FFBEBEBE" } };

/** Writes a table into a sheet from `firstRow` down; numbers and dates go in as real ones. Returns the next free row. */
function writeTable(sheet: Worksheet, table: Table, firstRow: number): number {
  const rows = [...table.head, ...table.body];
  const placed = place(rows);
  const widths: number[] = [];
  for (const { cell, row, col } of placed) {
    const target = sheet.getCell(firstRow + row, col + 1);
    target.value = cell.value ?? cell.text;
    if (cell.format) target.numFmt = cell.format;
    target.font = { bold: cell.bold === true, ...(cell.fill === "head" ? { color: { argb: "FFFFFFFF" } } : {}) };
    if (cell.fill) target.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FILL[cell.fill] } };
    target.alignment = { horizontal: cell.align === "right" ? "right" : "left", vertical: "top", wrapText: cell.text.includes("\n") };
    target.border = { top: THIN, left: THIN, bottom: THIN, right: THIN };
    const rowSpan = cell.rowSpan ?? 1;
    const colSpan = cell.colSpan ?? 1;
    if (rowSpan > 1 || colSpan > 1) sheet.mergeCells(firstRow + row, col + 1, firstRow + row + rowSpan - 1, col + colSpan);
    else widths[col] = Math.max(widths[col] ?? 0, Math.max(...cell.text.split("\n").map((line) => line.length)));
  }
  widths.forEach((width, col) => {
    const column = sheet.getColumn(col + 1);
    column.width = Math.min(48, Math.max(column.width ?? 8, width + 2));
  });
  return firstRow + rows.length + 1;
}

/** An Excel file of the chosen blocks, one sheet each: tables with real numbers, charts as a picture with their numbers below. */
export async function makeXlsx(title: string, blocks: Resolved[]): Promise<Blob> {
  const module = await import("exceljs");
  const ExcelJS = module.default ?? module;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "E-Agle TRT";
  workbook.created = new Date();
  workbook.title = title;

  const used = new Set<string>();
  for (const { title: heading, collected } of blocks) {
    const sheet = workbook.addWorksheet(sheetName(heading, used));
    sheet.getCell("A1").value = heading;
    sheet.getCell("A1").font = { bold: true, size: 14 };
    let row = 3;
    if (collected.kind === "chart") {
      const picture = await chartPicture(collected.svg, heading, collected.legend);
      const image = workbook.addImage({ base64: picture.dataUrl, extension: "png" });
      sheet.addImage(image, { tl: { col: 0, row: 2 }, ext: { width: picture.width, height: picture.height } });
      row = 3 + Math.ceil(picture.height / 20) + 1; // a default row is 20 pixels high: the picture keeps its room
    }
    writeTable(sheet, collected.table, row);
    if (collected.kind === "table") sheet.views = [{ state: "frozen", ySplit: row - 1 + collected.table.head.length }];
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
