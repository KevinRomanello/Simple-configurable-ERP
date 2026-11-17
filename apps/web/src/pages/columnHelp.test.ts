import { describe, expect, it } from "vitest";
import type { ColDef, ColGroupDef } from "ag-grid-community";
import { areaColumns, type GridLookups, type Row } from "./areaColumns";
import { columnHelp } from "./columnHelp";

const lookups: GridLookups = {
  categories: [],
  priorities: [],
  vatRates: [],
  funds: { estimate: [], actual: [] },
  fundById: new Map(),
  fundByName: new Map(),
  supplierNames: [],
  supplierIdByName: new Map(),
  cars: [],
  seasonId: 1,
};

type Column = ColDef<Row> | ColGroupDef<Row>;
/** Every heading of the grid, groups included. */
const headings = (columns: Column[]): Column[] => columns.flatMap((c) => ("children" in c ? [c, ...headings(c.children as Column[])] : [c]));

// ALSO FROM is there only when a fund runs short: it is asked for here, so it is checked too
const all = headings(areaColumns(lookups, () => undefined, () => undefined, true, { estimate: true, actual: true }));
const label = (c: Column) => ("colId" in c && c.colId ? c.colId : (c.headerName ?? ""));

describe("the explanation of the columns of the budget", () => {
  it("every column and every block has one (the bin has none)", () => {
    const without = all.filter((c) => !c.headerTooltip && label(c) !== "remove").map(label);
    expect(without).toEqual([]);
  });

  it("the grid still has the columns that were explained", () => {
    expect(all.map(label)).toEqual(expect.arrayContaining(["status", "item", "estimate.outflow", "actual.arrival", "note"]));
  });

  it("GRAND TOTAL is not a column of the budget any more", () => {
    expect(all.map((c) => c.headerName)).not.toContain("GRAND TOTAL");
  });

  it("the words change with the block where the block matters", () => {
    expect(columnHelp("quantity", "estimate")).not.toEqual(columnHelp("quantity", "actual"));
    expect(columnHelp("outflow", "estimate")).not.toEqual(columnHelp("outflow", "actual"));
  });

  it("a column that needs no words has none", () => {
    expect(columnHelp("remove")).toBeUndefined();
  });
});
