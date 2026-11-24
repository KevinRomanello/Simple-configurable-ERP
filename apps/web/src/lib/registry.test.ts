import { describe, expect, it } from "vitest";
import type { RegField } from "../api/registry";
import { FIELD_TYPES, canBeName as engineCanBeName } from "@erp/registry";
import { canBeName, formatDuration, groupLevels, isPicture, opsFor, planMove, recordsQuery, showValue, viewFields } from "./registry";

const field = (id: number, type: RegField["type"], options: RegField["options"] = {}, position = id): RegField => ({ id, name: `F${id}`, type, options, required: false, unique: false, description: "", position });

describe("the values of the registry as text", () => {
  it("writes links and files by name, lists with commas, ratings as stars, numbers as their field says", () => {
    expect(showValue(field(1, "link"), [{ id: 1, name: "SW" }, { id: 2, name: "HW" }])).toBe("SW, HW");
    expect(showValue(field(1, "attachment"), [{ id: 3, name: "cv.pdf", mime: "application/pdf", size: 1 }])).toBe("cv.pdf");
    expect(showValue(field(1, "multiselect"), ["C", "Python"])).toBe("C, Python");
    expect(showValue(field(1, "rating", { max: 5 }), 3)).toBe("★★★☆☆");
    // Italian groups thousands from five digits on
    expect(showValue(field(1, "number", { precision: 2, format: "currency" }), 12345.5)).toBe("€ 12.345,50");
    expect(showValue(field(1, "number", { format: "percent" }), 40)).toBe("40%");
    expect(showValue(field(1, "checkbox"), true)).toBe("✓");
    expect(showValue(field(1, "checkbox"), false)).toBe("");
    expect(showValue(field(1, "created"), "2026-11-21T09:30:00.000Z")).toBe("2026-11-21 09:30");
    expect(showValue(field(1, "text"), null)).toBe("");
  });
});

describe("the tools of a view", () => {
  it("offers the conditions that make sense for each type", () => {
    expect(opsFor("checkbox").map((o) => o.op)).toEqual(["checked", "notChecked"]);
    expect(opsFor("date").map((o) => o.op)).toContain("lt");
    expect(opsFor("link").map((o) => o.op)).toContain("anyOf");
    expect(opsFor("text").map((o) => o.op)).toContain("contains");
    expect(opsFor("attachment").map((o) => o.op)).toEqual(["empty", "notEmpty"]);
  });

  it("builds the address of a list, leaving out what is not there", () => {
    const filter = { join: "and" as const, items: [{ field: 3, op: "eq" as const, value: "x" }] };
    expect(recordsQuery(7, { filter, sort: "-3", q: " anna ", groupBy: [4, 5] }).toString()).toBe(
      `view=7&filter=${encodeURIComponent(JSON.stringify(filter))}&sort=-3&q=anna&groupBy=4%2C5&limit=1000`,
    );
    // no groups at all, even where the view has them
    expect(recordsQuery(7, { groupBy: [] }).toString()).toBe("view=7&groupBy=&limit=1000");
    expect(recordsQuery(undefined, { filter: { join: "and", items: [] }, q: "  " }).toString()).toBe("limit=1000");
  });

  it("shows the fields of a view in its order, without the hidden ones", () => {
    const fields = [field(1, "text"), field(2, "text"), field(3, "text"), field(4, "text")];
    expect(viewFields(fields, { hidden: [2], order: [4, 1] }).map((f) => f.id)).toEqual([4, 1, 3]);
    expect(viewFields(fields, {}).map((f) => f.id)).toEqual([1, 2, 3, 4]);
  });
});

describe("the types and tools that came with NocoDB's comparison", () => {
  it("writes durations, times and coordinates as people read them", () => {
    expect(formatDuration(5400)).toBe("1:30");
    expect(formatDuration(5430, "h:mm:ss")).toBe("1:30:30");
    expect(formatDuration(5.25, "h:mm:ss.ss")).toBe("0:00:05.25");
    expect(showValue({ type: "duration", options: { durationFormat: "h:mm" } }, 45000)).toBe("12:30");
    expect(showValue({ type: "time", options: {} }, "14:30:00")).toBe("14:30");
    expect(showValue({ type: "geodata", options: {} }, "46.07;11.12")).toBe("46.07, 11.12");
  });

  it("offers within on dates, not all of on lists, and reads the levels of a grouping", () => {
    expect(opsFor("date").map((o) => o.op)).toContain("within");
    expect(opsFor("user").map((o) => o.op)).toContain("notAllOf");
    expect(groupLevels(undefined)).toEqual([]);
    expect(groupLevels(4)).toEqual([4]);
    expect(groupLevels([4, 5])).toEqual([4, 5]);
  });
});

describe("moving a bar of the timeline", () => {
  const bars = [
    { id: 1, start: "2026-11-02", end: "2026-11-06", next: [2] },
    { id: 2, start: "2026-11-09", end: "2026-11-10", next: [3] },
    { id: 3, start: "2026-11-20", end: "2026-11-20", next: [1] },
  ];

  it("pushes the records after it that would start too early, keeping their length", () => {
    // the first ends on the 12th now: the second starts on the 13th (two days long), the third is still after it
    expect(planMove(bars, 1, "2026-11-04", "2026-11-12")).toEqual([
      { id: 1, start: "2026-11-04", end: "2026-11-12" },
      { id: 2, start: "2026-11-13", end: "2026-11-14" },
    ]);
  });

  it("moves in a chain, and stops at a loop of links", () => {
    const moves = planMove(bars, 2, "2026-11-19", "2026-11-25");
    expect(moves.find((m) => m.id === 3)).toEqual({ id: 3, start: "2026-11-26", end: "2026-11-26" });
    expect(moves.find((m) => m.id === 1)).toEqual({ id: 1, start: "2026-11-27", end: "2026-12-01" });
  });

  it("never ends before it starts", () => {
    expect(planMove(bars, 3, "2026-11-21", "2026-11-18")).toEqual([{ id: 3, start: "2026-11-21", end: "2026-11-21" }, { id: 1, start: "2026-11-22", end: "2026-11-26" }, { id: 2, start: "2026-11-27", end: "2026-11-28" }]);
  });
});

describe("isPicture", () => {
  it("is true for the files the server saved as an image, and only for them", () => {
    expect(isPicture({ mime: "image/png" })).toBe(true);
    expect(isPicture({ mime: "image/svg+xml" })).toBe(true);
    expect(isPicture({ mime: "application/pdf" })).toBe(false);
    expect(isPicture({ mime: "" })).toBe(false);
  });
});

describe("canBeName", () => {
  it("says what the engine says, for every type of field", () => {
    for (const type of FIELD_TYPES) expect([type, canBeName(type)]).toEqual([type, engineCanBeName(type)]);
  });

  it("takes a text or a formula and leaves a link, many choices and a file", () => {
    expect(canBeName("text") && canBeName("formula") && canBeName("select") && canBeName("date")).toBe(true);
    expect(canBeName("link") || canBeName("lookup") || canBeName("multiselect") || canBeName("attachment") || canBeName("checkbox")).toBe(false);
  });
});

