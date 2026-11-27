import { describe, expect, it } from "vitest";
import { gridCompare, nextSort, sortRows, type SortAccessors } from "./sort";

interface Row {
  name: string;
  cents: number | null;
}
const rows: Row[] = [
  { name: "item 10", cents: 500 },
  { name: "Item 2", cents: null },
  { name: "apple", cents: 500 },
  { name: "Zed", cents: 100 },
];
const accessors: SortAccessors<Row> = { name: (r) => r.name, cents: (r) => r.cents };
const names = (list: Row[]) => list.map((r) => r.name);

describe("sortRows", () => {
  it("keeps the rows as they came when nothing is chosen, or the column is unknown", () => {
    expect(sortRows(rows, accessors, null)).toBe(rows);
    expect(sortRows(rows, accessors, { key: "nope", direction: 1 })).toBe(rows);
  });

  it("sorts text without caring for capitals, and numbers inside the text as numbers", () => {
    expect(names(sortRows(rows, accessors, { key: "name", direction: 1 }))).toEqual(["apple", "Item 2", "item 10", "Zed"]);
    expect(names(sortRows(rows, accessors, { key: "name", direction: -1 }))).toEqual(["Zed", "item 10", "Item 2", "apple"]);
  });

  it("sorts numbers as numbers", () => {
    expect(sortRows(rows, accessors, { key: "cents", direction: 1 }).map((r) => r.cents)).toEqual([100, 500, 500, null]);
  });

  it("puts empty values last in both directions, and keeps equal rows in their order", () => {
    const up = sortRows(rows, accessors, { key: "cents", direction: 1 });
    const down = sortRows(rows, accessors, { key: "cents", direction: -1 });
    expect(down.map((r) => r.cents)).toEqual([500, 500, 100, null]);
    expect(names(up).slice(1, 3)).toEqual(["item 10", "apple"]);
    expect(names(down).slice(0, 2)).toEqual(["item 10", "apple"]);
  });

  it("does not change the rows it is given", () => {
    const copy = [...rows];
    sortRows(rows, accessors, { key: "name", direction: 1 });
    expect(rows).toEqual(copy);
  });
});

describe("nextSort", () => {
  it("goes ascending, descending, then back to the original order", () => {
    const first = nextSort(null, "name");
    expect(first).toEqual({ key: "name", direction: 1 });
    const second = nextSort(first, "name");
    expect(second).toEqual({ key: "name", direction: -1 });
    expect(nextSort(second, "name")).toBeNull();
  });

  it("starts ascending on a different column", () => {
    expect(nextSort({ key: "name", direction: -1 }, "cents")).toEqual({ key: "cents", direction: 1 });
  });
});

describe("gridCompare", () => {
  // the grid multiplies the result by -1 when the order is descending
  const sortLikeTheGrid = (values: unknown[], descending: boolean) =>
    [...values].sort((a, b) => gridCompare(a, b, descending) * (descending ? -1 : 1));

  it("puts empty values last in both directions", () => {
    const values = [5, "", 1, null, undefined, 3];
    expect(sortLikeTheGrid(values, false).slice(0, 3)).toEqual([1, 3, 5]);
    expect(sortLikeTheGrid(values, true).slice(0, 3)).toEqual([5, 3, 1]);
    expect(sortLikeTheGrid(values, true).slice(3).every((v) => v === "" || v === null || v === undefined)).toBe(true);
  });

  it("compares text like the tables do", () => {
    expect(sortLikeTheGrid(["item 10", "Item 2", "apple"], false)).toEqual(["apple", "Item 2", "item 10"]);
  });
});
