import { describe, expect, it } from "vitest";
import { MIN_WIDTH, columnCount, columnStarts, columnWidths, columnsKey, filled, parseWidths, resized } from "./columnResize";

const one = { colSpan: 1, rowSpan: 1 };

describe("columnStarts", () => {
  it("numbers the cells of a plain header from the left", () => {
    expect(columnStarts([[one, one, one]])).toEqual([[0, 1, 2]]);
  });

  it("counts the columns a cell covers", () => {
    expect(columnStarts([[one, { colSpan: 2, rowSpan: 1 }, one]])).toEqual([[0, 1, 3]]);
  });

  it("moves the cells of the second row to the right of a cell that covers two rows", () => {
    // | A (2 rows) | EXPECTED (2 columns) |
    // |            | qty | cost           |
    const rows = [[{ colSpan: 1, rowSpan: 2 }, { colSpan: 2, rowSpan: 1 }], [one, one]];
    expect(columnStarts(rows)).toEqual([[0, 1], [1, 2]]);
  });

  it("counts a header with no cells as no columns", () => {
    expect(columnStarts([])).toEqual([]);
    expect(columnCount([])).toBe(0);
  });
});

describe("columnCount", () => {
  it("is the widest header row, with the covered columns", () => {
    expect(columnCount([[one, one]])).toBe(2);
    expect(columnCount([[{ colSpan: 1, rowSpan: 2 }, { colSpan: 2, rowSpan: 1 }], [one, one]])).toBe(3);
  });
});

describe("columnWidths", () => {
  it("takes the width of each cell over one column", () => {
    expect(columnWidths([{ start: 0, span: 1, width: 100 }, { start: 1, span: 1, width: 80.4 }], 2)).toEqual([100, 80]);
  });

  it("gives a column only a wide cell covers an equal share of what is left", () => {
    // a group over columns 1 and 2 (200 px), column 1 known to be 120: column 2 has the rest
    expect(columnWidths([{ start: 1, span: 2, width: 200 }, { start: 1, span: 1, width: 120 }, { start: 0, span: 1, width: 60 }], 3)).toEqual([60, 120, 80]);
    // nothing known under it: the width is shared equally
    expect(columnWidths([{ start: 0, span: 2, width: 200 }], 2)).toEqual([100, 100]);
  });

  it("never gives less than the minimum, even when the group is narrower than what its columns already take", () => {
    expect(columnWidths([{ start: 0, span: 2, width: 100 }, { start: 0, span: 1, width: 100 }], 2)).toEqual([100, MIN_WIDTH]);
  });
});

describe("resized", () => {
  it("changes only the column dragged", () => {
    expect(resized([100, 100, 100], 1, 150.4)).toEqual([100, 150, 100]);
  });

  it("stops at the minimum", () => {
    expect(resized([100, 100], 0, 10)).toEqual([MIN_WIDTH, 100]);
    expect(resized([100, 100], 0, -300)).toEqual([MIN_WIDTH, 100]);
  });
});

describe("filled", () => {
  it("shares what a narrower column gave up among the others, in proportion, so the table keeps the width of its box", () => {
    // 300 + 100 + 200 = 600; the first made 100 narrower: 200 + 100 + 200 = 500, 100 missing, to be shared by 100 and 200
    const widths = filled([200, 100, 200], 0, 600);
    expect(widths).toEqual([200, 133, 267]);
    expect(widths.reduce((sum, w) => sum + w, 0)).toBe(600);
  });

  it("gives the pixels lost by rounding to the last of the other columns, and always adds up to the box", () => {
    for (const available of [601, 602, 605, 999]) {
      const widths = filled([100, 100, 100], 1, available);
      expect(widths.reduce((sum, w) => sum + w, 0)).toBe(available);
      expect(widths[1]).toBe(100); // the column being dragged keeps what was asked
    }
  });

  it("works when the last column is the one made narrower", () => {
    expect(filled([100, 200, 100], 2, 500)).toEqual([133, 267, 100]);
  });

  it("leaves a table alone that is as wide as its box or wider (it grows, with the scroll bar)", () => {
    expect(filled([300, 300], 0, 600)).toEqual([300, 300]);
    expect(filled([500, 300], 0, 600)).toEqual([500, 300]);
  });

  it("has nothing to share when there is only one column", () => {
    expect(filled([200], 0, 600)).toEqual([200]);
  });
});

describe("what is kept in the browser", () => {
  it("has one entry per page and set of headers", () => {
    expect(columnsKey("/settings/budget", ["SEASON", "FROM"])).toBe("erp.columns|/settings/budget|SEASON|FROM");
    expect(columnsKey("/settings/budget", ["SEASON", "FROM"])).not.toBe(columnsKey("/settings/register", ["SEASON", "FROM"]));
  });

  it("reads the widths back when they fit the table", () => {
    expect(parseWidths("[100,120,90]", 3)).toEqual([100, 120, 90]);
  });

  it("ignores what is not usable", () => {
    expect(parseWidths(null, 3)).toBeNull();
    expect(parseWidths("", 3)).toBeNull();
    expect(parseWidths("not json", 3)).toBeNull();
    expect(parseWidths("[100,120]", 3)).toBeNull(); // another number of columns
    expect(parseWidths('[100,"x",90]', 3)).toBeNull();
    expect(parseWidths("[100,5,90]", 3)).toBeNull(); // under the minimum
    expect(parseWidths('{"a":1}', 1)).toBeNull();
  });
});
