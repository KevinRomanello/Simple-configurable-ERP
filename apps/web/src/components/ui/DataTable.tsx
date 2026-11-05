import type { ReactNode } from "react";
import { useSort, type SortState, type SortValue } from "../../lib/sort";
import { TableBox } from "../ExportBlocks";
import { SortTh } from "../SortTh";

/** One column of a table. */
export interface Column<T> {
  /** Unique within the table; it is also the name of the sort. */
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** The value to sort by: with it the header can be clicked to sort. */
  sort?: (row: T) => SortValue;
  /** A column of numbers: aligned on the right. */
  num?: boolean;
  /** Classes of the header and of every cell of the column (`sum`, `group-start`…). */
  className?: string;
  /** Classes of one cell only, depending on the row (`cell-negative`…). */
  cellClass?: (row: T) => string | undefined;
  /**
   * On a phone, where each row is a card: `title` is the top line of the card (by default the first
   * column), `hidden` is left out (a picture, what the title already says).
   */
  mobile?: "title" | "hidden";
}

const classes = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(" ") || undefined;

/** The empty row of a table: one cell across every column. */
export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="empty">{children}</td>
    </tr>
  );
}

/**
 * A table of the page as every page draws it: in its box (downloadable under `title`), headers that
 * sort the rows (the same in every table), the empty row while there is nothing to show, and the
 * total rows (`footer`) last. `rows` undefined means still loading: no "empty" line yet. On a phone
 * each row is a card (`phone="scroll"` keeps the table, scrolling sideways).
 */
export function DataTable<T>({ title, columns, rows, rowKey, rowClass, empty, footer, initialSort = null, className, phone = "cards" }: {
  title: string;
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string | number;
  rowClass?: (row: T) => string | undefined;
  empty?: ReactNode;
  footer?: ReactNode;
  initialSort?: SortState | null;
  /** More classes of the table itself. */
  className?: string;
  phone?: "cards" | "scroll";
}) {
  const sort = useSort<T>(Object.fromEntries(columns.filter((c) => c.sort).map((c) => [c.key, c.sort!])), initialSort);
  const titleKey = (columns.find((c) => c.mobile === "title") ?? columns.find((c) => c.mobile !== "hidden"))?.key;
  const columnClass = (c: Column<T>) =>
    classes(c.num && "num", c.className, c.key === titleKey && "cell-title", c.mobile === "hidden" && "cell-hidden");
  return (
    <TableBox title={title} cards={phone === "cards"}>
      <table className={classes("data-table", phone === "cards" && "cards", className)}>
        <thead>
          <tr>
            {columns.map((c) =>
              c.sort ? (
                <SortTh key={c.key} sort={sort} by={c.key} className={columnClass(c)}>{c.header}</SortTh>
              ) : (
                <th key={c.key} className={columnClass(c)}>{c.header}</th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {sort.sorted(rows ?? []).map((row) => (
            <tr key={rowKey(row)} className={rowClass?.(row)}>
              {columns.map((c) => (
                <td key={c.key} className={classes(columnClass(c), c.cellClass?.(row))}>{c.cell(row)}</td>
              ))}
            </tr>
          ))}
          {rows !== undefined && rows.length === 0 && empty && <EmptyRow colSpan={columns.length}>{empty}</EmptyRow>}
          {footer}
        </tbody>
      </table>
    </TableBox>
  );
}
