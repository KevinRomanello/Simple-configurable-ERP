import { describe, expect, it } from "vitest";
import { figures, line, snapshot } from "./fixtures";
import { itemsView, type ItemsFilters } from "./items";

const dated = (date: string | null) => figures(1, 100, { purchaseDate: date });

const s = snapshot({
  projects: [
    { id: 1, areaId: 1, name: "Zeta", ownerName: null, position: 1 },
    { id: 2, areaId: 1, name: "Alpha", ownerName: null, position: 2 },
    { id: 3, areaId: 2, name: "Sw project", ownerName: null, position: 1 },
  ],
  lines: [
    line(1, 1, dated("2026-12-01"), dated("2026-12-05"), { item: "a", category: "Components", priority: "Low" }),
    line(2, 1, dated("2026-10-01"), null, { item: "b", category: "Asset", priority: "High" }),
    line(3, 2, dated(null), null, { item: "c", category: "Components", priority: null }),
    line(4, 2, dated("2026-11-01"), dated("2026-10-20"), { item: "d", category: "Components", priority: "Medium" }),
    line(5, 3, dated("2026-09-01"), null, { item: "e", category: "Asset", priority: "High" }),
    line(6, 1, dated("2026-01-01"), null, { item: "f", category: null, priority: "High" }),
  ],
});

const view = (overrides: Partial<ItemsFilters> = {}) =>
  itemsView(s, { categories: [], priority: "all", sort: "estimate-date", ...overrides });
const items = (overrides: Partial<ItemsFilters> = {}) => view(overrides).rows.map((r) => r.item);

describe("itemsView", () => {
  it("never shows an item without a category, as in the old sheet", () => {
    expect(items()).not.toContain("f");
  });

  it("sorts by expected purchase date, oldest first, undated last", () => {
    expect(items()).toEqual(["e", "b", "d", "a", "c"]);
  });

  it("sorts by actual purchase date; the undated follow by area, then project A-Z", () => {
    // d (20 Oct) and a (5 Dec) have an actual date; c (Alpha), b (Zeta) and e (SW) have none
    expect(items({ sort: "actual-date" })).toEqual(["d", "a", "c", "b", "e"]);
  });

  it("filters by categories", () => {
    expect(items({ categories: ["Asset"] })).toEqual(["e", "b"]);
    expect(items({ categories: ["Asset", "Components"] })).toHaveLength(5);
  });

  it("filters a single priority", () => {
    expect(items({ priority: "High" })).toEqual(["e", "b"]);
    expect(items({ priority: "Medium" })).toEqual(["d"]);
  });

  it("sorts by priority, keeping items without one last in both directions", () => {
    expect(items({ priority: "high-to-low" })).toEqual(["e", "b", "d", "a", "c"]);
    expect(items({ priority: "low-to-high" })).toEqual(["a", "d", "e", "b", "c"]);
  });

  it("groups by area, then project A-Z, then original order", () => {
    const result = view({ sort: "area-project" });
    expect(result.groupedByArea).toBe(true);
    // area 1: Alpha (c, d) before Zeta (a, b); area 2: e
    expect(result.rows.map((r) => r.item)).toEqual(["c", "d", "a", "b", "e"]);
    expect(result.rows.map((r) => r.areaName)).toEqual(["MT + DMT", "MT + DMT", "MT + DMT", "MT + DMT", "SW"]);
  });

  it("carries fund, supplier, outflow and dates of both phases", () => {
    const [first] = view().rows;
    expect(first).toMatchObject({
      item: "e",
      projectName: "Sw project",
      estimate: { outflowCents: 12_200, purchaseDate: "2026-09-01" },
      actual: { outflowCents: 0, purchaseDate: null },
    });
  });
});
