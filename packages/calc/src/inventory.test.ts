import { describe, expect, it } from "vitest";
import { arrivalOf, arrivalStatus, linePricesE4 } from "./arrival";
import { daysBetween } from "./dates";
import { figures, line, snapshot } from "./fixtures";
import {
  bom, costContext, costSeries, monthEnds, onHandMilli, pendingLines, priceHistory, receivedMilli, receiptsOf,
  stats, stockRows, unitCost, unitPriceE4, valueCents,
  type InventoryData, type ItemInput, type MovementInput, type PartInput,
} from "./inventory";
import { computeLines } from "./lines";

// Helpers: a bought item, a receipt of 5.000 pieces at 2.0000 €, etc. Quantities in thousandths,
// prices in ten-thousandths of a euro.
let nextId = 1;
const item = (id: number, name: string, extra: Partial<ItemInput> = {}): ItemInput => ({
  id, name, category: null, origin: "bought", unit: "pcs", ...extra,
});
const move = (m: Partial<MovementInput> & Pick<MovementInput, "itemId" | "kind" | "quantityMilli">): MovementInput => ({
  id: nextId++, on: "2026-10-01", location: "s1-r1", spot: "", toLocation: null, toSpot: null,
  unitNetE4: null, unitGrossE4: null, unitTeamE4: null, projectId: null, lineId: null, ...m,
});
const receipt = (itemId: number, qty: number, netEuros: number, on: string, extra: Partial<MovementInput> = {}) =>
  move({
    itemId, kind: "receipt", quantityMilli: qty * 1000, on,
    unitNetE4: Math.round(netEuros * 10_000), unitGrossE4: Math.round(netEuros * 1.22 * 10_000), unitTeamE4: Math.round(netEuros * 1.22 * 10_000),
    ...extra,
  });
const part = (componentId: number, partId: number, qty: number): PartInput => ({ componentId, partId, quantityMilli: qty * 1000 });

describe("stockRows", () => {
  it("adds receipts and counts, takes away uses and disposals, and moves transfers between places", () => {
    const rows = stockRows([
      receipt(1, 10, 1, "2026-09-01"),
      receipt(1, 5, 1, "2026-09-02", { location: "s1-r2", spot: "Shelf A" }),
      move({ itemId: 1, kind: "use", quantityMilli: 3_000 }),
      move({ itemId: 1, kind: "disposal", quantityMilli: 1_000, location: "s1-r2", spot: "Shelf A" }),
      move({ itemId: 1, kind: "transfer", quantityMilli: 2_000, toLocation: "s2-r1", toSpot: "Box 4" }),
      move({ itemId: 1, kind: "adjustment", quantityMilli: -500 }),
      receipt(2, 1, 1, "2026-09-03"),
    ]);
    expect(rows).toEqual([
      { itemId: 1, location: "s1-r1", spot: "", quantityMilli: 4_500 }, // 10 - 3 - 2 - 0.5
      { itemId: 1, location: "s1-r2", spot: "Shelf A", quantityMilli: 4_000 },
      { itemId: 1, location: "s2-r1", spot: "Box 4", quantityMilli: 2_000 },
      { itemId: 2, location: "s1-r1", spot: "", quantityMilli: 1_000 },
    ]);
  });

  it("leaves out what is used up, and tells apart two spots of the same room", () => {
    const rows = stockRows([
      receipt(1, 4, 1, "2026-09-01", { spot: "A" }),
      receipt(1, 4, 1, "2026-09-01", { spot: "B" }),
      move({ itemId: 1, kind: "use", quantityMilli: 4_000, spot: "A" }),
    ]);
    expect(rows).toEqual([{ itemId: 1, location: "s1-r1", spot: "B", quantityMilli: 4_000 }]);
  });

  it("keeps a negative balance visible: it means the data is wrong", () => {
    expect(stockRows([move({ itemId: 1, kind: "use", quantityMilli: 1_000 })])[0]?.quantityMilli).toBe(-1_000);
  });

  it("sums what is on hand and what was ever received", () => {
    const movements = [receipt(1, 10, 1, "2026-09-01"), receipt(1, 5, 1, "2026-09-02"), move({ itemId: 1, kind: "use", quantityMilli: 12_000 })];
    expect(onHandMilli(stockRows(movements), 1)).toBe(3_000);
    expect(receivedMilli(movements, 1)).toBe(15_000);
  });
});

describe("prices", () => {
  const movements = [
    receipt(1, 10, 1.0, "2026-06-10"),
    receipt(1, 30, 2.0, "2026-08-20"),
    receipt(1, 10, 3.0, "2026-08-20"), // same day, stored later
  ];
  const net = receiptsOf(movements, 1, "net");

  it("the last price is the latest receipt up to the day, the later one if two came the same day", () => {
    expect(unitPriceE4(net, "last", "2026-06-30")).toBe(10_000);
    expect(unitPriceE4(net, "last", "2026-08-20")).toBe(30_000);
    expect(unitPriceE4(net, "last", "2099-01-01")).toBe(30_000);
  });

  it("the average is weighted by quantity", () => {
    expect(unitPriceE4(net, "average", "2026-06-30")).toBe(10_000);
    expect(unitPriceE4(net, "average", "2026-08-19")).toBe(10_000);
    // (10 x 1 + 30 x 2) / 40 = 1.75, then (10 + 60 + 30) / 50 = 2.00
    expect(unitPriceE4(receiptsOf(movements.slice(0, 2), 1, "net"), "average", "2026-12-31")).toBe(17_500);
    expect(unitPriceE4(net, "average", "2026-12-31")).toBe(20_000);
  });

  it("has no price before the first purchase", () => {
    expect(unitPriceE4(net, "last", "2026-06-09")).toBeNull();
    expect(unitPriceE4([], "average", "2026-12-31")).toBeNull();
  });

  it("picks the price asked for: net, with VAT, or what the team pays", () => {
    const m = [move({ itemId: 1, kind: "receipt", quantityMilli: 1_000, unitNetE4: 10_000, unitGrossE4: 12_200, unitTeamE4: 0 })];
    expect(unitPriceE4(receiptsOf(m, 1, "net"), "last", "2026-12-31")).toBe(10_000);
    expect(unitPriceE4(receiptsOf(m, 1, "gross"), "last", "2026-12-31")).toBe(12_200);
    expect(unitPriceE4(receiptsOf(m, 1, "team"), "last", "2026-12-31")).toBe(0); // a donation
  });

  it("lists every purchase, oldest first", () => {
    expect(priceHistory([...movements].reverse(), 1, "net").map((p) => [p.on, p.unitE4])).toEqual([
      ["2026-06-10", 10_000], ["2026-08-20", 20_000], ["2026-08-20", 30_000],
    ]);
  });

  it("is exact for the largest amounts the API accepts", () => {
    const huge = [move({ itemId: 1, kind: "receipt", quantityMilli: 1_000_000_000, unitNetE4: 100_000_000_000, unitGrossE4: 0, unitTeamE4: 0 })];
    expect(unitPriceE4(receiptsOf(huge, 1, "net"), "average", "2026-12-31")).toBe(100_000_000_000);
    expect(valueCents(1_000_000_000, 100_000_000_000)).toBe(1_000_000_000_000_000); // 10^13 euros
  });
});

describe("what a made thing costs", () => {
  // 1 screw, 2 plate (bought), 10 bracket (made: 1 plate + 6 screws), 11 pedal (made: 1 bracket + 4 screws + 2 plates)
  const items = [
    item(1, "Screw"), item(2, "Plate"), item(10, "Bracket", { origin: "made" }), item(11, "Pedal", { origin: "made" }),
  ];
  const parts = [part(10, 2, 1), part(10, 1, 6), part(11, 10, 1), part(11, 1, 4), part(11, 2, 2)];
  const movements = [
    receipt(1, 100, 0.1, "2026-06-01"), receipt(2, 10, 5, "2026-06-01"),
    receipt(1, 100, 0.2, "2026-09-01"), receipt(2, 10, 7, "2026-09-01"),
  ];
  const data: InventoryData = { items, movements, parts };
  const ctx = costContext(data, "net");

  it("costs a bought item at its price and a made one at the sum of its parts", () => {
    expect(unitCost(1, ctx, "last", "2026-06-30")).toEqual({ unitE4: 1_000, complete: true });
    // bracket in June: 1 plate (5) + 6 screws (0.6) = 5.60
    expect(unitCost(10, ctx, "last", "2026-06-30")).toEqual({ unitE4: 56_000, complete: true });
    // pedal in June: bracket 5.60 + 4 screws 0.40 + 2 plates 10 = 16.00
    expect(unitCost(11, ctx, "last", "2026-06-30")).toEqual({ unitE4: 160_000, complete: true });
  });

  it("follows the prices over time", () => {
    // September: plate 7, screw 0.20 -> bracket 8.20; pedal 8.20 + 0.80 + 14 = 23.00
    expect(unitCost(11, ctx, "last", "2026-09-30").unitE4).toBe(230_000);
    const series = costSeries(11, ctx, "last", ["2026-05-31", "2026-06-30", "2026-08-31", "2026-09-30"]);
    expect(series.map((p) => p.unitE4)).toEqual([null, 160_000, 160_000, 230_000]);
    expect(series.map((p) => p.complete)).toEqual([false, true, true, true]);
  });

  it("the average price smooths the two purchases", () => {
    // plate (5 + 7)/2 = 6, screw 0.15 -> bracket 6.90; pedal 6.90 + 0.60 + 12 = 19.50
    expect(unitCost(11, ctx, "average", "2026-09-30").unitE4).toBe(195_000);
  });

  it("says when a material was never bought: the cost is there but incomplete", () => {
    const missing = costContext({ items, movements: movements.filter((m) => m.itemId !== 2), parts }, "net");
    expect(unitCost(10, missing, "last", "2026-09-30")).toEqual({ unitE4: 12_000, complete: false }); // only the 6 screws
    const nothing = costContext({ items, movements: [], parts }, "net");
    expect(unitCost(10, nothing, "last", "2026-09-30")).toEqual({ unitE4: null, complete: false });
  });

  it("lists the bill of materials with a total that adds up on screen", () => {
    const result = bom(11, ctx, "last", "2026-06-30");
    expect(result.lines.map((l) => [l.name, l.quantityMilli, l.unitE4, l.totalCents])).toEqual([
      ["Bracket", 1_000, 56_000, 560],
      ["Screw", 4_000, 1_000, 40],
      ["Plate", 2_000, 50_000, 1_000],
    ]);
    expect(result.totalCents).toBe(1_600);
    expect(result.unitE4).toBe(160_000);
    expect(result.complete).toBe(true);
  });

  it("refuses a bill of materials that contains itself", () => {
    const loop = costContext({ items, movements, parts: [...parts, part(2, 11, 1)] }, "net"); // plate needs the pedal...
    expect(() => unitCost(11, loop, "last", "2026-06-30")).toThrow(/contains itself/);
  });
});

describe("monthEnds", () => {
  it("gives the last day of each month, and ends on the day asked for", () => {
    expect(monthEnds("2026-11-05", "2027-02-10")).toEqual(["2026-11-30", "2026-12-31", "2027-01-31", "2027-02-10"]);
    expect(monthEnds("2028-01-31", "2028-03-31")).toEqual(["2028-01-31", "2028-02-29", "2028-03-31"]); // leap year
    expect(monthEnds("2026-02-01", "2026-02-15")).toEqual(["2026-02-15"]);
    expect(monthEnds("2027-03-01", "2027-02-01")).toEqual([]);
  });
});

describe("daysBetween", () => {
  it("counts whole days, across months and leap days", () => {
    expect(daysBetween("2026-10-01", "2026-10-31")).toBe(30);
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
    expect(daysBetween("2026-10-31", "2026-10-01")).toBe(-30);
  });
});

describe("arrival", () => {
  it("tells planned, ordered, partial, received and over apart", () => {
    expect(arrivalStatus(0, 0)).toBe("planned");
    expect(arrivalStatus(10_000, 0)).toBe("ordered");
    expect(arrivalStatus(10_000, 4_000)).toBe("partial");
    expect(arrivalStatus(10_000, 10_000)).toBe("received");
    expect(arrivalStatus(10_000, 12_000)).toBe("over");
    expect(arrivalStatus(0, 1_000)).toBe("over");
    expect(arrivalOf(10_000, 4_000)).toEqual({ boughtMilli: 10_000, receivedMilli: 4_000, status: "partial" });
  });

  const base = (actual: ReturnType<typeof figures> | null, receipts: { lineId: number; quantityMilli: number }[] = []) =>
    snapshot({
      projects: [{ id: 1, areaId: 1, name: "Brakes", ownerName: null, position: 1 }],
      suppliers: [{ id: 1, name: "Acme" }],
      lines: [line(1, 1, figures(5, 10), actual, { item: "Sensor", category: "Components" })],
      receipts,
    });

  it("is part of every calculated line", () => {
    expect(computeLines(base(null))[0]!.arrival.status).toBe("planned");
    expect(computeLines(base(figures(10, 10)))[0]!.arrival.status).toBe("ordered");
    expect(computeLines(base(figures(10, 10), [{ lineId: 1, quantityMilli: 4_000 }]))[0]!.arrival).toEqual({
      boughtMilli: 10_000, receivedMilli: 4_000, status: "partial",
    });
    expect(computeLines(base(figures(10, 10), [{ lineId: 99, quantityMilli: 4_000 }]))[0]!.arrival.status).toBe("ordered");
  });

  it("works out the price of one unit in the three ways", () => {
    // 10 x 10 EUR net, 22% VAT, no sponsor: net 100, VAT 22
    const [l] = computeLines(base(figures(10, 10)));
    expect(linePricesE4(l!)).toEqual({ net: 100_000, gross: 122_000, team: 122_000 });
    // a total sponsor pays the net; like in the sheet (open question Q1) the VAT stays with the team
    const [sponsored] = computeLines(base(figures(10, 10, { sponsorType: "total" })));
    expect(linePricesE4(sponsored!)).toEqual({ net: 100_000, gross: 122_000, team: 22_000 });
    // a partial sponsor of 40 EUR out of 100 net: VAT on 60 = 13.20, team pays 60 + 13.20
    const [partial] = computeLines(base(figures(10, 10, { sponsorType: "partial", sponsorValueCents: 4_000 })));
    expect(linePricesE4(partial!)).toEqual({ net: 100_000, gross: 113_200, team: 73_200 });
    expect(linePricesE4(computeLines(base(null))[0]!)).toBeNull();
  });

  it("rounds the price of one unit to the ten-thousandth", () => {
    // 3 units for a net of 10.00 -> 3.3333 per unit
    const [l] = computeLines(base(figures(3, 10 / 3, { vatRate: 0 })));
    expect(linePricesE4(l!)!.net).toBe(33_333);
  });
});

describe("pendingLines", () => {
  const lines = computeLines(
    snapshot({
      projects: [
        { id: 1, areaId: 1, name: "Brakes", ownerName: null, position: 1 },
        { id: 2, areaId: 2, name: "Logger", ownerName: null, position: 1 },
      ],
      suppliers: [{ id: 1, name: "Acme" }],
      lines: [
        line(1, 1, figures(5, 10, { arrivalDate: "2026-11-30" }), figures(5, 10, { purchaseDate: "2026-10-01", supplierId: 1 })),
        line(2, 2, figures(2, 50), figures(2, 50, { purchaseDate: "2026-09-15", arrivalDate: "2026-10-20" })),
        line(3, 1, figures(1, 1), figures(4, 5, { purchaseDate: "2026-10-05" })),
        line(4, 1, figures(1, 1), null),
        line(5, 1, figures(1, 1), figures(1, 1, { purchaseDate: "2026-10-02" })),
        line(6, 2, figures(1, 1), figures(2, 1)),
      ],
      receipts: [{ lineId: 3, quantityMilli: 4_000 }, { lineId: 5, quantityMilli: 500 }],
    }),
  );

  it("lists what was bought and has not fully arrived, oldest purchase first, undated last", () => {
    const pending = pendingLines(lines, "2026-10-20");
    expect(pending.map((p) => [p.lineId, p.status])).toEqual([[2, "ordered"], [1, "ordered"], [5, "partial"], [6, "ordered"]]);
  });

  it("knows how much is left, how long it has been waiting and when it is expected", () => {
    const pending = Object.fromEntries(pendingLines(lines, "2026-10-20").map((p) => [p.lineId, p]));
    expect(pending[5]).toMatchObject({ boughtMilli: 1_000, receivedMilli: 500, remainingMilli: 500, daysWaiting: 18 });
    expect(pending[1]!.expectedArrival).toBe("2026-11-30"); // typed in the EXPECTED phase
    expect(pending[2]!.expectedArrival).toBe("2026-10-20"); // the actual one wins
    expect(pending[6]!.daysWaiting).toBeNull();
    expect(pending[1]).toMatchObject({ projectName: "Brakes", supplierName: "Acme", areaCode: "mt-dmt" });
  });
});

describe("stats", () => {
  const lines = computeLines(
    snapshot({
      projects: [
        { id: 1, areaId: 1, name: "Brakes", ownerName: null, position: 1 },
        { id: 2, areaId: 2, name: "Logger", ownerName: null, position: 1 },
      ],
      lines: [
        line(1, 1, figures(5, 10), figures(5, 10, { purchaseDate: "2026-10-01", vatRate: 0 }), { category: "Components" }),
        line(2, 2, figures(2, 50), figures(2, 50, { purchaseDate: "2026-10-01", vatRate: 0 }), { category: "Asset" }),
      ],
      receipts: [{ lineId: 1, quantityMilli: 2_000 }],
    }),
  );
  const items = [item(1, "Sensor", { category: "Components" }), item(2, "Box", { category: "Asset" }), item(3, "Glue", { category: null })];
  const movements = [
    receipt(1, 2, 10, "2026-10-05", { projectId: 1, lineId: 1 }), // 20 EUR for Brakes
    receipt(2, 1, 50, "2026-10-06", { projectId: 2, location: "s1-r2" }), // 50 EUR for Logger
    receipt(3, 4, 2.5, "2026-10-07", { location: "s1-r2" }), // 10 EUR, no project
    move({ itemId: 1, kind: "use", quantityMilli: 1_000, projectId: 2, on: "2026-10-10" }), // 10 EUR used by Logger
  ];
  const data: InventoryData = { items, movements, parts: [] };
  const context = { projects: [{ id: 1, name: "Brakes", areaId: 1 }, { id: 2, name: "Logger", areaId: 2 }], areas: [{ id: 1, name: "MT + DMT" }, { id: 2, name: "SW" }] };
  const run = (dimension: Parameters<typeof stats>[0]) => stats(dimension, data, lines, context, "net", "2026-10-20");
  const by = (rows: ReturnType<typeof run>) => Object.fromEntries(rows.map((r) => [r.label, r]));

  it("by project: bought, still on its way, used", () => {
    const rows = by(run("project"));
    expect(rows["Brakes"]).toMatchObject({ boughtCents: 2_000, pendingCents: 3_000, usedCents: 0, items: 1 }); // 3 of 5 still to come, at 10 each
    expect(rows["Logger"]).toMatchObject({ boughtCents: 5_000, pendingCents: 10_000, usedCents: 1_000, items: 2 });
    expect(rows["(no project)"]).toMatchObject({ boughtCents: 1_000 });
  });

  it("by area: the same, grouped by the area of the project", () => {
    const rows = by(run("area"));
    expect(rows["MT + DMT"]).toMatchObject({ boughtCents: 2_000, pendingCents: 3_000 });
    expect(rows["SW"]).toMatchObject({ boughtCents: 5_000, usedCents: 1_000 });
  });

  it("by category: also what is in stock, at the average price", () => {
    const rows = by(run("category"));
    expect(rows["Components"]).toMatchObject({ boughtCents: 2_000, usedCents: 1_000, stockCents: 1_000, pendingCents: 3_000 }); // 1 left x 10
    expect(rows["Asset"]).toMatchObject({ boughtCents: 5_000, stockCents: 5_000 });
    expect(rows["(no category)"]).toMatchObject({ boughtCents: 1_000, stockCents: 1_000 });
  });

  it("by location: what is where", () => {
    const rows = by(run("location"));
    expect(rows["s1-r1"]).toMatchObject({ stockCents: 1_000, items: 1 });
    expect(rows["s1-r2"]).toMatchObject({ stockCents: 6_000, items: 2 });
  });

  it("the total bought is the same however it is cut", () => {
    const total = (dimension: Parameters<typeof stats>[0]) => run(dimension).reduce((sum, r) => sum + r.boughtCents, 0);
    expect(total("project")).toBe(8_000);
    expect(total("area")).toBe(8_000);
    expect(total("category")).toBe(8_000);
  });

  it("values the same goods at the price chosen", () => {
    const m = [move({ itemId: 1, kind: "receipt", quantityMilli: 1_000, unitNetE4: 10_000, unitGrossE4: 12_200, unitTeamE4: 0, location: "s1-r1" })];
    const data2: InventoryData = { items, movements: m, parts: [] };
    const bought = (basis: "net" | "gross" | "team") => stats("category", data2, [], context, basis, "2026-10-20").find((r) => r.key === "Components")?.boughtCents;
    expect([bought("net"), bought("gross"), bought("team")]).toEqual([100, 122, 0]);
  });
});
