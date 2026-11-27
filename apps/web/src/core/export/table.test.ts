import { describe, expect, it } from "vitest";
import { dropEmptyColumns, makeCell, place, typedValue, type Cell } from "./table";

const text = (...texts: string[]): Cell[] => texts.map((t) => makeCell(t));

describe("typedValue", () => {
  it("reads money as the app writes it", () => {
    expect(typedValue("1.220,00 €", false)).toEqual({ value: 1220, format: '#,##0.00 "€"' });
    expect(typedValue("-7,23 €", false).value).toBe(-7.23);
    expect(typedValue("0,00 €", false).value).toBe(0);
    expect(typedValue("945,43 €", false).value).toBe(945.43);
  });

  it("reads percentages as fractions", () => {
    expect(typedValue("22%", false)).toEqual({ value: 0.22, format: "0%" });
    expect(typedValue("-29,82%", false)).toEqual({ value: -0.2982, format: "0.00%" });
  });

  it("reads dates, two-digit years and ISO, without any time zone", () => {
    expect(typedValue("14/10/26", false).value).toEqual(new Date(Date.UTC(2026, 9, 14)));
    expect(typedValue("2026-10-14", false).value).toEqual(new Date(Date.UTC(2026, 9, 14)));
    expect(typedValue("01/02/2027", false).format).toBe("dd/mm/yyyy");
  });

  it("leaves a date that does not exist as text", () => {
    expect(typedValue("31/02/26", false)).toEqual({});
  });

  it("takes a bare number only in a numeric column, so codes keep their zeros", () => {
    expect(typedValue("0042", false)).toEqual({});
    expect(typedValue("1.500", true).value).toBe(1500);
    expect(typedValue("7,5", true)).toEqual({ value: 7.5, format: "#,##0.0" });
  });

  it("leaves words alone", () => {
    expect(typedValue("Torquemeter", true)).toEqual({});
    expect(typedValue("", true)).toEqual({});
    expect(typedValue("12 pcs", true)).toEqual({});
  });
});

describe("place", () => {
  it("counts the spans of the cells above and to the left", () => {
    const rows: Cell[][] = [
      [{ text: "ITEM", rowSpan: 2 }, { text: "EXPECTED", colSpan: 2 }, { text: "NOTE", rowSpan: 2 }],
      [{ text: "QTY" }, { text: "COST" }],
    ];
    expect(place(rows).map((p) => [p.cell.text, p.row, p.col])).toEqual([
      ["ITEM", 0, 0],
      ["EXPECTED", 0, 1],
      ["NOTE", 0, 3],
      ["QTY", 1, 1],
      ["COST", 1, 2],
    ]);
  });
});

describe("dropEmptyColumns", () => {
  it("takes out a column with nothing in it", () => {
    const table = { head: [text("A", "", "B")], body: [text("1", "", "2"), text("3", "", "4")] };
    expect(dropEmptyColumns(table)).toEqual({ head: [text("A", "B")], body: [text("1", "2"), text("3", "4")] });
  });

  it("keeps a column that is empty in the body but has a heading", () => {
    const table = { head: [text("A", "B")], body: [text("1", ""), text("2", "")] };
    expect(dropEmptyColumns(table)).toBe(table);
  });

  it("narrows a spanning cell, and drops it when nothing is left under it", () => {
    const head: Cell[] = [{ text: "GROUP", colSpan: 2 }, { text: "", colSpan: 1 }];
    const table = { head: [head], body: [text("1", "2", "")] };
    const result = dropEmptyColumns(table);
    expect(result.head[0]).toEqual([{ text: "GROUP", colSpan: 2 }]);
    expect(result.body[0]!.map((c) => c.text)).toEqual(["1", "2"]);
  });

  it("keeps a column that a titled group spans over", () => {
    const table = {
      head: [[{ text: "GROUP", colSpan: 3 }], text("A", "", "C")],
      body: [text("1", "", "3")],
    };
    expect(dropEmptyColumns(table)).toBe(table);
  });
});
