// The calculations behind the resizable columns of every table (components/ui/Table.tsx). Pure: the table is read
// and written there; here are the numbers.

/** What a header cell says about the grid: how many columns and rows it covers. */
export interface CellSpan {
  colSpan: number;
  rowSpan: number;
}

/** A header cell as it is on the screen: from which column, how many columns, how wide. */
export interface Measured {
  start: number;
  span: number;
  width: number;
}

/** The narrowest a column can be made, in px: enough for its handle and a letter. */
export const MIN_WIDTH = 48;

/**
 * The first column of every cell of the header rows. A cell that covers more rows (rowSpan) takes its columns
 * from the rows below, so the cells there start further to the right: `[[a (2 rows), b], [c]]` puts c in column 1.
 */
export function columnStarts(rows: CellSpan[][]): number[][] {
  const taken = new Set<string>();
  return rows.map((cells, r) => {
    let column = 0;
    return cells.map(({ colSpan, rowSpan }) => {
      while (taken.has(`${r},${column}`)) column++;
      const start = column;
      for (let down = 0; down < rowSpan; down++) for (let across = 0; across < colSpan; across++) taken.add(`${r + down},${start + across}`);
      column += colSpan;
      return start;
    });
  });
}

/** How many columns the header rows cover. */
export function columnCount(rows: CellSpan[][]): number {
  const starts = columnStarts(rows);
  return rows.reduce((most, cells, r) => cells.reduce((m, cell, i) => Math.max(m, starts[r]![i]! + cell.colSpan), most), 0);
}

/**
 * The width of every column, from the measured header cells. A cell over one column gives that column's width;
 * a cell over several gives what is left of its width, after the columns it covers that are already known, shared equally.
 */
export function columnWidths(cells: Measured[], count: number): number[] {
  const widths: (number | undefined)[] = new Array(count).fill(undefined);
  for (const c of [...cells].sort((a, b) => a.span - b.span)) {
    const covered = Array.from({ length: c.span }, (_, i) => c.start + i);
    const unknown = covered.filter((i) => widths[i] === undefined);
    if (unknown.length === 0) continue;
    const known = covered.reduce((sum, i) => sum + (widths[i] ?? 0), 0);
    for (const i of unknown) widths[i] = Math.max(MIN_WIDTH, (c.width - known) / unknown.length);
  }
  return widths.map((w) => Math.round(w ?? MIN_WIDTH));
}

/** The widths with column `index` made `wanted` wide (never under MIN_WIDTH): the other columns keep theirs. */
export function resized(widths: number[], index: number, wanted: number): number[] {
  return widths.map((w, i) => (i === index ? Math.max(MIN_WIDTH, Math.round(wanted)) : w));
}

/**
 * The widths after a column has been made narrower, so that the table does not shrink: what it gave up (the box is
 * `available` px wide) is shared among the other columns in proportion to their widths. A table already as wide as the
 * box, or wider, is left alone: it only grows when a column is made wider.
 */
export function filled(widths: number[], index: number, available: number): number[] {
  const others = widths.reduce((sum, w, i) => (i === index ? sum : sum + w), 0);
  const missing = available - (others + (widths[index] ?? 0));
  if (missing <= 0 || others === 0) return widths;
  const grown = widths.map((w, i) => (i === index ? w : w + Math.floor((missing * w) / others)));
  // the pixels the rounding lost go to the last of the other columns
  const last = grown.map((_, i) => i).filter((i) => i !== index).at(-1)!;
  grown[last] = grown[last]! + available - grown.reduce((sum, w) => sum + w, 0);
  return grown;
}

/** Where the widths of a table are kept in the browser: one entry per page and set of headers. */
export function columnsKey(path: string, headers: string[]): string {
  return `erp.columns|${path}|${headers.join("|")}`;
}

/** The widths read back from what was stored, or null when they are not usable (not stored, damaged, another number of columns). */
export function parseWidths(stored: string | null, count: number): number[] | null {
  if (!stored) return null;
  try {
    const widths: unknown = JSON.parse(stored);
    const usable = Array.isArray(widths) && widths.length === count && widths.every((w) => typeof w === "number" && Number.isFinite(w) && w >= MIN_WIDTH);
    return usable ? (widths as number[]) : null;
  } catch {
    return null;
  }
}
