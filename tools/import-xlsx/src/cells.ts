import { parseFlexibleDate } from "@erp/calc";
import type { Cell, CellValue, Worksheet } from "exceljs";

// The sheet stores formulas, rich text, hyperlinks and dates in different shapes. These helpers
// reduce a cell to a plain value: a formula gives its saved result, rich text and hyperlinks
// their text, a date its ISO string.

export type Plain = string | number | boolean | null;

function normalise(value: CellValue | undefined): Plain {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value !== "object") return value;
  if ("result" in value) return normalise(value.result as CellValue | undefined);
  if ("richText" in value) return value.richText.map((part) => part.text).join("");
  if ("text" in value) return String(value.text); // hyperlink: keep the text, drop the link
  return null; // formula without a saved result, or an error value
}

export const plain = (cell: Cell): Plain => normalise(cell.value);

/** Trimmed text, or null when the cell is empty. */
export function str(sheet: Worksheet, row: number, col: number): string | null {
  const value = plain(sheet.getCell(row, col));
  if (value === null || typeof value === "boolean") return value === null ? null : String(value);
  const text = String(value).trim();
  return text === "" ? null : text;
}

export function num(sheet: Worksheet, row: number, col: number): number | null {
  const value = plain(sheet.getCell(row, col));
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
}

export function bool(sheet: Worksheet, row: number, col: number): boolean | null {
  const value = plain(sheet.getCell(row, col));
  return typeof value === "boolean" ? value : null;
}

/** An ISO date, from a real date cell or from text typed in one of the accepted notations. */
export function isoDate(sheet: Worksheet, row: number, col: number): string | null {
  const value = plain(sheet.getCell(row, col));
  if (typeof value !== "string") return null;
  return parseFlexibleDate(value);
}

/** The ARGB background of a cell, upper case, or null. */
export function fill(sheet: Worksheet, row: number, col: number): string | null {
  const background = sheet.getCell(row, col).fill;
  if (background?.type !== "pattern") return null;
  return background.fgColor?.argb?.toUpperCase() ?? null;
}
