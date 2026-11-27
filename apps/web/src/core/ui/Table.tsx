import { useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode, type TableHTMLAttributes } from "react";
import { columnCount, columnStarts, columnWidths, columnsKey, filled, parseWidths, resized, type CellSpan } from "../columnResize";
import { SCREEN, useMaxWidth } from "../screen";

/** The width in px of the right edge of a header that is the handle of its column (the same as `th::after` in theme/components.css). */
const GRAB = 6;

const headerRows = (table: HTMLTableElement) => (table.tHead ? [...table.tHead.rows] : []);
const spansOf = (row: HTMLTableRowElement): CellSpan[] => [...row.cells].map((c) => ({ colSpan: c.colSpan, rowSpan: Math.max(1, c.rowSpan) }));

/** The text of the last header row: with the page, it says which table this is. */
const headerTexts = (table: HTMLTableElement) => [...(headerRows(table).at(-1)?.cells ?? [])].map((c) => c.textContent?.trim() ?? "");

function readSaved(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // the browser may not allow it (private window): the widths are just not kept
  }
}

function save(key: string, widths: number[]) {
  try {
    localStorage.setItem(key, JSON.stringify(widths));
  } catch {
    // not kept: the widths still hold until the page is left
  }
}

/**
 * A box with the scroll bar around a table that is not one of the page's downloadable blocks (a table of a form, a list
 * of a settings panel): the border and the sideways scroll of `TableBox`, without being on the Download list.
 */
export function TableScroll({ children }: { children: ReactNode }) {
  return <div className="table-wrap">{children}</div>;
}

/**
 * The table of the site: every table in the pages is this one (a test checks it), so all of them behave alike. Its
 * columns can be resized: drag the right edge of a header. The first drag fixes the width of every column as it is,
 * so nothing jumps, and then that column changes; when it gets narrower the others share what it gave up, because the
 * table keeps the width of its box (it is never shorter than the page), and when it gets wider the table grows and the
 * box around it scrolls sideways. The widths are kept in the browser, for this page and these headers. A header across
 * several columns has no handle, and on a phone, where each row is a card, nothing can be resized.
 */
export function Table({ className, style, children, ...rest }: TableHTMLAttributes<HTMLTableElement>) {
  const table = useRef<HTMLTableElement>(null);
  const [widths, setWidths] = useState<number[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const looked = useRef<string | null>(null); // the key whose saved widths were looked up last
  const drag = useRef<{ index: number; from: number; width: number; widths: number[]; available: number } | null>(null);
  const asCards = useMaxWidth(SCREEN.cards) && (className?.includes("phone-cards") ?? false);

  // After every drawing: the headers may have changed (another type in the inventory, a column added)
  useLayoutEffect(() => {
    const el = table.current;
    if (!el) return;
    const count = columnCount(headerRows(el).map(spansOf));
    const key = columnsKey(window.location.pathname, headerTexts(el));
    if (looked.current !== key) {
      looked.current = key;
      setWidths(parseWidths(readSaved(key), count));
    } else if (widths && widths.length !== count) setWidths(null);
  });

  const start = (e: PointerEvent<HTMLTableElement>) => {
    const el = table.current;
    const th = (e.target as Element).closest("th");
    if (!el || !th || asCards || e.button !== 0 || th.colSpan > 1 || th.classList.contains("drag-cell") || th.closest("table") !== el) return;
    if (e.clientX < th.getBoundingClientRect().right - GRAB) return;
    const rows = headerRows(el);
    const row = rows.indexOf(th.parentElement as HTMLTableRowElement);
    if (row < 0) return; // a header cell of the body: no column to resize
    const spans = rows.map(spansOf);
    const starts = columnStarts(spans);
    const index = starts[row]![th.cellIndex]!;
    const now =
      widths ??
      columnWidths(rows.flatMap((r, i) => [...r.cells].map((c, j) => ({ start: starts[i]![j]!, span: c.colSpan, width: c.getBoundingClientRect().width }))), columnCount(spans));
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    drag.current = { index, from: e.clientX, width: now[index]!, widths: now, available: el.parentElement?.clientWidth ?? 0 };
    setWidths(now);
    setDragging(true);
  };
  const move = (e: PointerEvent<HTMLTableElement>) => {
    const d = drag.current;
    if (d) setWidths(filled(resized(d.widths, d.index, d.width + e.clientX - d.from), d.index, d.available));
  };
  const end = () => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    if (widths && looked.current) save(looked.current, widths);
  };

  const sized = widths !== null && !asCards;
  const width = sized ? widths.reduce((sum, w) => sum + w, 0) : undefined;
  return (
    <table
      {...rest}
      ref={table}
      className={["data-table", className, sized && "sized", dragging && "resizing"].filter(Boolean).join(" ")}
      style={sized ? { ...style, tableLayout: "fixed", width } : style}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {sized && (
        <colgroup>
          {widths.map((w, i) => <col key={i} style={{ width: w }} />)}
        </colgroup>
      )}
      {children}
    </table>
  );
}
