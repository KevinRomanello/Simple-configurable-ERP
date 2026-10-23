import { useState } from "react";

/** What a row has in a column, to compare. `null` means "nothing there": it goes last, whatever the direction. */
export type SortValue = string | number | null;

/** For each column a table can be sorted by, how to read its value from a row. */
export type SortAccessors<T> = Record<string, (row: T) => SortValue>;

export interface SortState {
  key: string;
  direction: 1 | -1;
}

/** What a header needs to show and change the order. */
export interface SortControl {
  state: SortState | null;
  toggle: (key: string) => void;
}

function compare(x: string | number, y: string | number): number {
  if (typeof x === "number" && typeof y === "number") return x - y;
  // "Item 2" before "Item 10", and capitals do not count
  return String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: "base" });
}

/** How `Array.sort` wants two values compared; an empty value is after any other, whatever the direction. */
export function compareValues(x: SortValue, y: SortValue, direction: 1 | -1 = 1): number {
  if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
  return compare(x, y) * direction;
}

/** The rows in the order of the chosen column; equal rows keep the order they had. With no choice, the rows as they came. */
export function sortRows<T>(rows: T[], accessors: SortAccessors<T>, state: SortState | null): T[] {
  const read = state && accessors[state.key];
  if (!state || !read) return rows;
  return [...rows].sort((a, b) => compareValues(read(a), read(b), state.direction));
}

const toSortValue = (value: unknown): SortValue => (value === null || value === undefined || value === "" ? null : typeof value === "number" ? value : String(value));

/**
 * The comparison of a column of the budget grid, the same as in every table. The grid turns the
 * result round when the order is descending, so for an empty value it is turned round first:
 * empty values stay last in both directions.
 */
export function gridCompare(a: unknown, b: unknown, isDescending: boolean): number {
  const x = toSortValue(a);
  const y = toSortValue(b);
  const order = compareValues(x, y);
  return (x === null || y === null) && isDescending ? -order : order;
}

/** The next order after a click on a header: ascending, then descending, then the original order. */
export function nextSort(now: SortState | null, key: string): SortState | null {
  if (!now || now.key !== key) return { key, direction: 1 };
  return now.direction === 1 ? { key, direction: -1 } : null;
}

/**
 * Sorting by column, the same in every table: `sorted(rows)` gives the rows in the chosen order
 * (call it on each group of rows if the table has groups), `<SortTh>` changes the choice.
 */
export function useSort<T>(accessors: SortAccessors<T>, initial: SortState | null = null) {
  const [state, setState] = useState<SortState | null>(initial);
  return {
    state,
    toggle: (key: string) => setState((now) => nextSort(now, key)),
    sorted: (rows: T[]) => sortRows(rows, accessors, state),
  };
}
