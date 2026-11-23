import { faGripVertical } from "@fortawesome/free-solid-svg-icons";
import type { ReactNode } from "react";
import { useDragOrder } from "../../lib/useDragOrder";
import { useSort, type SortState, type SortValue } from "../../lib/sort";
import { IconButton } from "../Button";
import { TableBox } from "../ExportBlocks";
import { SortTh } from "../SortTh";
import { Table } from "./Table";

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

/** Rows that can be moved by a handle in a first column (never in a table with columns to sort by: its order would not be the real one). */
export interface Reorder<T> {
  /** Gets the ids of the movable rows in their new order when a handle is let go. */
  onOrder: (ids: number[]) => void;
  /** Names the row for the handle ("Drag to move …"). */
  label: (row: T) => string;
  /** A row that cannot move gets no handle and is not a place to drop on (default: every row can). */
  movable?: (row: T) => boolean;
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
 * each row is a card (`phone="scroll"` keeps the table, scrolling sideways). With `reorder` the rows
 * (their `rowKey` must be a number) have a handle, in a first column, to drag them into another order.
 */
export function DataTable<T>({ title, columns, rows, rowKey, rowClass, empty, footer, initialSort = null, className, phone = "cards", reorder, listed = true }: {
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
  reorder?: Reorder<T>;
  /** False for a table of work (the fields of a registry table): it is not on the Download list of the page. */
  listed?: boolean;
}) {
  const sort = useSort<T>(Object.fromEntries(columns.filter((c) => c.sort).map((c) => [c.key, c.sort!])), initialSort);
  const shown = sort.sorted(rows ?? []);
  const movable = (row: T) => reorder !== undefined && (reorder.movable?.(row) ?? true);
  const movableIds = shown.filter(movable).map((row) => Number(rowKey(row)));
  const drag = useDragOrder(movableIds, reorder?.onOrder ?? (() => {}));
  const titleKey = (columns.find((c) => c.mobile === "title") ?? columns.find((c) => c.mobile !== "hidden"))?.key;
  const columnClass = (c: Column<T>) =>
    classes(c.num && "num", c.className, c.key === titleKey && "cell-title", c.mobile === "hidden" && "cell-hidden");
  return (
    <TableBox title={title} cards={phone === "cards"} listed={listed}>
      <Table className={classes(phone === "cards" && "phone-cards", className)}>
        <thead>
          <tr>
            {reorder && <th className="drag-cell" aria-label="Order" />}
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
          {shown.map((row) => {
            const id = Number(rowKey(row));
            const moves = movable(row);
            return (
              <tr key={rowKey(row)} className={classes(rowClass?.(row), moves && drag.classOf(id))} {...(moves ? drag.boxProps(id) : {})}>
                {reorder && (
                  <td className="drag-cell">
                    {moves && movableIds.length > 1 && <IconButton icon={faGripVertical} className="drag-handle" label={`Drag to move ${reorder.label(row)} (or use the up and down arrow keys)`} {...drag.handle(id)} />}
                  </td>
                )}
                {columns.map((c) => (
                  <td key={c.key} className={classes(columnClass(c), c.cellClass?.(row))}>{c.cell(row)}</td>
                ))}
              </tr>
            );
          })}
          {rows !== undefined && rows.length === 0 && empty && <EmptyRow colSpan={columns.length + (reorder ? 1 : 0)}>{empty}</EmptyRow>}
          {footer}
        </tbody>
      </Table>
    </TableBox>
  );
}
