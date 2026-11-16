import { describe, expect, it } from "vitest";
import type { InventoryData, ItemInput, PartInput } from "./inventory";
import { makePlan, maxMakeable, placesOf, takeFromShelf } from "./makePlan";

const item = (id: number, name: string, origin: "bought" | "made" = "bought", unit = "pcs"): ItemInput => ({ id, name, category: null, origin, unit });
const part = (componentId: number, partId: number, quantityMilli: number): PartInput => ({ componentId, partId, quantityMilli });
const shelf = (entries: [number, number][]) => new Map(entries);

// 10 = Frame, made of 2 plates (1), 6 screws (2) and 2.2 m² of film (3)
const frame: Pick<InventoryData, "items" | "parts"> = {
  items: [item(10, "Frame", "made"), item(1, "Plate"), item(2, "Screw"), item(3, "Film", "bought", "m²")],
  parts: [part(10, 1, 2000), part(10, 2, 6000), part(10, 3, 2200)],
};

describe("makePlan", () => {
  it("says for each part what it takes, what is there, what is left and what is missing", () => {
    const plan = makePlan(10, 3000, frame, shelf([[1, 9], [2, 12_000], [3, 6600]].map(([a, b]) => [a!, b!] as [number, number])));
    expect(plan.lines.map((l) => [l.name, l.neededMilli, l.availableMilli, l.leftMilli, l.missingMilli])).toEqual([
      ["Plate", 6000, 9, 0, 5991],
      ["Screw", 18_000, 12_000, 0, 6000],
      ["Film", 6600, 6600, 0, 0],
    ]);
    expect(plan.enough).toBe(false);
  });

  it("is enough when everything is there, and says what stays on the shelf", () => {
    const plan = makePlan(10, 2000, frame, shelf([[1, 10_000], [2, 12_000], [3, 5000]]));
    expect(plan.enough).toBe(true);
    expect(plan.lines.map((l) => [l.leftMilli, l.missingMilli])).toEqual([[6000, 0], [0, 0], [600, 0]]);
  });

  it("works in thousandths: 2.2 of a part needs 2.2 on the shelf, not 2.199", () => {
    expect(makePlan(10, 1000, frame, shelf([[1, 2000], [2, 6000], [3, 2199]])).lines[2]).toMatchObject({ neededMilli: 2200, missingMilli: 1 });
    expect(makePlan(10, 1000, frame, shelf([[1, 2000], [2, 6000], [3, 2200]])).enough).toBe(true);
  });

  it("takes the sub-assemblies from the shelf first and makes the rest from their parts, with the parts counted once", () => {
    // 20 = Pedal, made of 1 Frame (10) and 4 screws (2): the screws are in the frame as well
    const data = { items: [...frame.items, item(20, "Pedal", "made")], parts: [...frame.parts, part(20, 10, 1000), part(20, 2, 4000)] };
    // two pedals: 2 frames wanted, 1 on the shelf, so 1 is made from 2 plates, 6 screws and 2.2 of film; plus 8 screws for the pedals
    const plan = makePlan(20, 2000, data, shelf([[10, 1000], [1, 2000], [2, 14_000], [3, 2200]]));
    const byName = Object.fromEntries(plan.lines.map((l) => [l.name, l]));
    expect(byName["Frame"]).toMatchObject({ neededMilli: 2000, availableMilli: 1000, makeFirstMilli: 1000, missingMilli: 0 });
    expect(byName["Screw"]).toMatchObject({ neededMilli: 14_000, missingMilli: 0 });
    expect(plan.enough).toBe(true);
    // the same job with one screw less
    expect(makePlan(20, 2000, data, shelf([[10, 1000], [1, 2000], [2, 13_999], [3, 2200]])).lines.find((l) => l.name === "Screw")).toMatchObject({ missingMilli: 1 });
  });

  it("leaves nothing to make first when the shelf has the sub-assemblies", () => {
    const data = { items: [...frame.items, item(20, "Pedal", "made")], parts: [...frame.parts, part(20, 10, 1000)] };
    const plan = makePlan(20, 2000, data, shelf([[10, 2000]]));
    expect(plan.lines).toHaveLength(1);
    expect(plan.lines[0]).toMatchObject({ name: "Frame", makeFirstMilli: 0, leftMilli: 0, missingMilli: 0 });
    expect(plan.enough).toBe(true);
  });

  it("treats a made item that has no parts as a part to be on the shelf", () => {
    const data = { items: [item(30, "Kit", "made"), item(31, "Loose", "made")], parts: [part(30, 31, 1000)] };
    expect(makePlan(30, 1000, data, shelf([])).lines[0]).toMatchObject({ name: "Loose", missingMilli: 1000, makeFirstMilli: 0 });
  });
});

describe("maxMakeable", () => {
  it("is what the scarcest part allows, to the thousandth, and names the part that stops it", () => {
    // plates for 5, screws for 2.5, film for 2.272…: the film stops it at 2.272
    const stock = shelf([[1, 10_000], [2, 15_000], [3, 5000]]);
    expect(maxMakeable(10, frame, stock)).toEqual({ maxMilli: 2272, limitedBy: [3] });
  });

  it("is exactly one piece with exactly what one takes, and none with a thousandth less", () => {
    expect(maxMakeable(10, frame, shelf([[1, 2000], [2, 6000], [3, 2200]])).maxMilli).toBe(1000);
    expect(maxMakeable(10, frame, shelf([[1, 2000], [2, 6000], [3, 2199]])).maxMilli).toBe(999);
  });

  it("is zero with nothing on the shelf and lists every part that is missing, the one missing most first", () => {
    expect(maxMakeable(10, frame, shelf([]))).toEqual({ maxMilli: 0, limitedBy: [2, 1, 3] });
  });

  it("counts the sub-assemblies it could make first", () => {
    const data = { items: [...frame.items, item(20, "Pedal", "made")], parts: [...frame.parts, part(20, 10, 1000)] };
    // no frame made, but parts for three (plates 6, screws 18, film 6.6)
    expect(maxMakeable(20, data, shelf([[1, 6000], [2, 18_000], [3, 6600]])).maxMilli).toBe(3000);
    // one frame made and parts for three more
    expect(maxMakeable(20, data, shelf([[10, 1000], [1, 6000], [2, 18_000], [3, 6600]])).maxMilli).toBe(4000);
  });

  it("is zero for an item with no parts, and is not fooled by parts so small they never run out", () => {
    expect(maxMakeable(30, { items: [item(30, "Kit", "made")], parts: [] }, shelf([]))).toEqual({ maxMilli: 0, limitedBy: [] });
    // a speck per piece and plenty of specks: the search stops at a million pieces and says so (no part stops it)
    const tiny = { items: [item(40, "Dust", "made"), item(41, "Speck")], parts: [part(40, 41, 1)] };
    expect(maxMakeable(40, tiny, shelf([[41, 1_000_000_000_000]]))).toEqual({ maxMilli: 1_000_000_000, limitedBy: [] });
    // and one speck is 1.499 pieces: a thousandth of a part rounds to the nearest thousandth, as the build does
    expect(maxMakeable(40, tiny, shelf([[41, 1]])).maxMilli).toBe(1499);
  });
});

describe("where the parts are taken from", () => {
  const rows = [
    { location: "a", spot: "", quantityMilli: 30_000 },
    { location: "b", spot: "x", quantityMilli: 100_000 },
    { location: "b", spot: "y", quantityMilli: 31_500 },
    { location: "c", spot: "", quantityMilli: 100_000 },
    { location: "d", spot: "", quantityMilli: 0 },
    { location: "e", spot: "", quantityMilli: -5_000 },
  ];

  it("lists the places that hold some, the one with the most first, ties by code, empty and negative ones left out", () => {
    expect(placesOf(rows)).toEqual([
      { location: "b", quantityMilli: 131_500 },
      { location: "c", quantityMilli: 100_000 },
      { location: "a", quantityMilli: 30_000 },
    ]);
    expect(placesOf([])).toEqual([]);
  });

  it("takes from the place with the most first, spot after spot, and goes on to the next place for the rest", () => {
    expect(takeFromShelf(rows, 120_000)).toEqual({ takes: [{ location: "b", spot: "x", quantityMilli: 100_000 }, { location: "b", spot: "y", quantityMilli: 20_000 }], missingMilli: 0 });
    expect(takeFromShelf(rows, 150_000).takes).toEqual([
      { location: "b", spot: "x", quantityMilli: 100_000 },
      { location: "b", spot: "y", quantityMilli: 31_500 },
      { location: "c", spot: "", quantityMilli: 18_500 },
    ]);
  });

  it("takes only from the place asked for, and says how much is missing when it is not enough there", () => {
    expect(takeFromShelf(rows, 40_000, "a")).toEqual({ takes: [{ location: "a", spot: "", quantityMilli: 30_000 }], missingMilli: 10_000 });
    expect(takeFromShelf(rows, 1_000, "nowhere")).toEqual({ takes: [], missingMilli: 1_000 });
  });

  it("is exact to the thousandth and says nothing is missing when the shelf holds exactly what is asked", () => {
    const total = 30_000 + 131_500 + 100_000;
    const all = takeFromShelf(rows, total);
    expect(all.missingMilli).toBe(0);
    expect(all.takes.reduce((sum, t) => sum + t.quantityMilli, 0)).toBe(total);
    expect(takeFromShelf(rows, total + 1).missingMilli).toBe(1);
    expect(takeFromShelf(rows, 0)).toEqual({ takes: [], missingMilli: 0 });
  });
});
