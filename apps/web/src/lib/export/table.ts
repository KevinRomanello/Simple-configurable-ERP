import type { Column, GridApi } from "ag-grid-community";

// What a table or a grid becomes before it is written into a file: rows of cells with the text
// the person sees and, when the text is a number or a date, the real value (an Excel file must
// let you add things up). The PDF and the Excel file are both made from this.

export interface Cell {
  text: string;
  /** The real number or date behind the text, for Excel. */
  value?: number | Date;
  /** The Excel number format of `value`. */
  format?: string;
  colSpan?: number;
  rowSpan?: number;
  align?: "left" | "right";
  bold?: boolean;
  /** Shading: the header, a band (the name of an area), a total row. */
  fill?: "head" | "band" | "total";
}

export interface Table {
  head: Cell[][];
  body: Cell[][];
}

const NBSP = / /g;

/**
 * The number or date a text stands for, as the app writes them: "1.220,00 €", "22%", "7,5",
 * "09/01/26", "2026-01-09". A bare number in a column that is not numeric ("0042", a code) stays
 * text, so it keeps its zeros.
 */
export function typedValue(raw: string, numeric: boolean): Pick<Cell, "value" | "format"> {
  const text = raw.replace(NBSP, " ").trim();

  const day = /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/.exec(text);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (day || iso) {
    const [year, month, date] = day
      ? [day[3]!.length === 2 ? 2000 + Number(day[3]) : Number(day[3]), Number(day[2]), Number(day[1])]
      : [Number(iso![1]), Number(iso![2]), Number(iso![3])];
    const value = new Date(Date.UTC(year, month - 1, date));
    // a date that does not exist (31/02) is only a text
    return value.getUTCMonth() === month - 1 ? { value, format: "dd/mm/yyyy" } : {};
  }

  const number = /^([+-]?)(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?( ?€| ?%)?$/.exec(text);
  if (!number) return {};
  const [, sign, whole = "0", decimals = "", unit = ""] = number;
  if (unit === "" && !numeric) return {};
  const value = Number(`${whole.replace(/\./g, "")}${decimals ? `.${decimals}` : ""}`) * (sign === "-" ? -1 : 1);
  if (unit.includes("%")) return { value: value / 100, format: decimals ? `0.${"0".repeat(decimals.length)}%` : "0%" };
  const digits = decimals ? `.${"0".repeat(decimals.length)}` : "";
  return unit.includes("€") ? { value, format: `#,##0${digits || ".00"} "€"` } : { value, format: `#,##0${digits}` };
}

/** A cell with its typed value worked out. */
export function makeCell(text: string, options: Omit<Cell, "text" | "value" | "format"> & { numeric?: boolean } = {}): Cell {
  const { numeric = false, ...rest } = options;
  return { text, ...typedValue(text, numeric), ...rest };
}

interface Placed {
  cell: Cell;
  row: number;
  col: number;
}

/** Where each cell sits once the spans of the cells above and to the left are counted. */
export function place(rows: Cell[][]): Placed[] {
  const taken = new Set<string>();
  const placed: Placed[] = [];
  rows.forEach((cells, row) => {
    let col = 0;
    for (const cell of cells) {
      while (taken.has(`${row}:${col}`)) col += 1;
      placed.push({ cell, row, col });
      for (let r = 0; r < (cell.rowSpan ?? 1); r += 1) {
        for (let c = 0; c < (cell.colSpan ?? 1); c += 1) taken.add(`${row + r}:${col + c}`);
      }
      col += cell.colSpan ?? 1;
    }
  });
  return placed;
}

/** Takes out the columns with nothing in them (the little delete buttons of a table), keeping the spans right. */
export function dropEmptyColumns(table: Table): Table {
  const rows = [...table.head, ...table.body];
  const placed = place(rows);
  const width = Math.max(0, ...placed.map((p) => p.col + (p.cell.colSpan ?? 1)));
  const full = new Set<number>();
  for (const { cell, col } of placed) {
    if (cell.text !== "") for (let c = col; c < col + (cell.colSpan ?? 1); c += 1) full.add(c);
  }
  const empty = new Set([...Array(width).keys()].filter((c) => !full.has(c)));
  if (empty.size === 0) return table;

  const narrowed = new Map<Cell, Cell | null>();
  for (const { cell, col } of placed) {
    const span = cell.colSpan ?? 1;
    const removed = [...empty].filter((c) => c >= col && c < col + span).length;
    narrowed.set(cell, removed === 0 ? cell : span - removed === 0 ? null : { ...cell, colSpan: span - removed });
  }
  const rebuild = (section: Cell[][]) =>
    section.map((cells) => cells.flatMap((cell) => narrowed.get(cell) ?? []));
  return { head: rebuild(table.head), body: rebuild(table.body) };
}

// --- from the page ------------------------------------------------------------------------------

/** What a box holds, written the way the app writes it: dates as 09/01/2026, numbers as 10.000,00 (as many decimals as its step). */
function inputText(field: HTMLInputElement): string {
  if (field.type === "checkbox") return field.checked ? "yes" : "no";
  if (field.type === "date") return field.value.split("-").reverse().join("/");
  if (field.type === "number" && field.value !== "") {
    const digits = field.step.split(".")[1]?.length ?? 0;
    return Number(field.value).toLocaleString("it-IT", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }
  return field.value;
}

/** What a cell of a table holds as the person reads it: a box shows what is in it. */
function textOf(cell: HTMLElement): string {
  const field = cell.querySelector("select, input");
  if (field instanceof HTMLSelectElement) return field.selectedOptions[0]?.text ?? "";
  if (field instanceof HTMLInputElement) return inputText(field);
  // buttons are commands, not data (a header to sort by is its title)
  const shown = cell.cloneNode(true) as HTMLElement;
  shown.querySelectorAll("button:not(.th-sort)").forEach((button) => button.remove());
  const lines = [...shown.querySelectorAll(":scope > div")];
  const raw = lines.length > 0 ? lines.map((l) => l.textContent ?? "").join("\n") : (shown.textContent ?? "");
  return raw
    .replace(NBSP, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .trim();
}

/** A table of the page, as it looks. */
export function tableFromDom(element: HTMLTableElement): Table {
  const rowOf = (tr: HTMLTableRowElement): Cell[] =>
    [...tr.cells].map((cell) => {
      const header = cell.tagName === "TH";
      const numeric = cell.classList.contains("num") || cell.querySelector("input[type=number]") !== null;
      return makeCell(textOf(cell), {
        numeric,
        colSpan: cell.colSpan > 1 ? cell.colSpan : undefined,
        rowSpan: cell.rowSpan > 1 ? cell.rowSpan : undefined,
        align: numeric ? "right" : undefined,
        bold: header || tr.classList.contains("total") || tr.classList.contains("group") || cell.classList.contains("sum") || undefined,
        fill: header ? "head" : tr.classList.contains("group") ? "band" : tr.classList.contains("total") ? "total" : undefined,
      });
    });
  const head = element.tHead ? [...element.tHead.rows].map(rowOf) : [];
  const body = [...element.tBodies].flatMap((section) => [...section.rows].map(rowOf));
  return dropEmptyColumns({ head, body });
}

const numericColumn = (column: Column) => {
  const classes = column.getColDef().cellClass;
  const list = Array.isArray(classes) ? classes : typeof classes === "string" ? [classes] : [];
  return list.includes("num") || list.includes("calc");
};

/** A grid of the budget: its columns as displayed (EXPECTED and ACTUAL as groups), its rows and its subtotal. */
export function tableFromGrid(api: GridApi): Table {
  const columns = api.getAllDisplayedColumns().filter((c) => (c.getColDef().headerName ?? "") !== "");
  const groupOf = (c: Column) => c.getParent()?.getColGroupDef()?.headerName ?? "";

  // first row: the groups (and, spanning both rows, the columns that belong to none); second: the others
  const top: Cell[] = [];
  const second: Cell[] = [];
  let index = 0;
  while (index < columns.length) {
    const column = columns[index]!;
    const group = groupOf(column);
    if (group === "") {
      top.push(makeCell(column.getColDef().headerName ?? "", { rowSpan: 2, bold: true, fill: "head" }));
      index += 1;
      continue;
    }
    let end = index;
    while (end < columns.length && groupOf(columns[end]!) === group) end += 1;
    top.push(makeCell(group, { colSpan: end - index, bold: true, fill: "head" }));
    for (const c of columns.slice(index, end)) second.push(makeCell(c.getColDef().headerName ?? "", { bold: true, fill: "head" }));
    index = end;
  }

  const rowOf = (rowNode: NonNullable<ReturnType<GridApi["getPinnedBottomRow"]>>, total: boolean): Cell[] =>
    columns.map((column) => {
      const value = api.getCellValue({ rowNode, colKey: column, useFormatter: true });
      const numeric = numericColumn(column);
      return makeCell(value == null ? "" : String(value).replace(NBSP, " "), {
        numeric,
        align: numeric ? "right" : undefined,
        bold: total || undefined,
        fill: total ? "total" : undefined,
      });
    });
  const body: Cell[][] = [];
  api.forEachNodeAfterFilterAndSort((node) => body.push(rowOf(node, false)));
  for (let i = 0; i < api.getPinnedBottomRowCount(); i += 1) body.push(rowOf(api.getPinnedBottomRow(i)!, true));
  return { head: second.length > 0 ? [top, second] : [top], body };
}
