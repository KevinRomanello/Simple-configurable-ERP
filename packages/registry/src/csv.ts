// CSV as spreadsheets write it (RFC 4180): commas, quotes doubled inside quoted cells, line breaks inside
// quotes. Used for the export and the import of a table.

const needsQuotes = /[",\r\n]|^\s|\s$/;

/** One CSV text from rows of cells; numbers and texts that look like formulas are kept as written. */
export function toCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          // a cell starting with = + - @ would run as a formula in a spreadsheet: keep it a text
          const safe = /^[=+\-@\t\r]/.test(cell) && !/^-?\d/.test(cell) ? `'${cell}` : cell;
          return needsQuotes.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
        })
        .join(","),
    )
    .join("\r\n");
}

/** The rows of a CSV text. A byte order mark and empty lines at the end are ignored. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  while (rows.length > 0 && rows[rows.length - 1]!.every((c) => c === "")) rows.pop();
  return rows;
}
