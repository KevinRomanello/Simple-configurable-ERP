import { describe, expect, it } from "vitest";
import type { Fund } from "./types";
import { choosesOwnRate, EMPTY_PHASE, fundsOfBoth, isSameActual, lineBody, newLineDraft, phaseFigures, withSameActual, type LineDraft, type LineLookups } from "./lineDraft";

const lookups: LineLookups = {
  fundByName: new Map([
    ["team's fund", { id: 1, kind: "team" }],
    ["sponsor a", { id: 2, kind: "external" }],
  ]),
  supplierIdByName: new Map([["amazon", 7]]),
};
const TODAY = "2026-10-29";
/** A line as the form starts (purchase dates of today), with the name typed in. */
const line = (change: Partial<LineDraft>): LineDraft => ({ ...newLineDraft(TODAY), item: "  Sensor ", ...change });
const body = (draft: LineDraft) => lineBody(draft, lookups, TODAY);

describe("lineBody, with ACTUAL same as EXPECTED", () => {
  const written = { ...EMPTY_PHASE, quantity: "2", unitCost: "5", fund: "Sponsor A", supplier: "Amazon", purchaseDate: "2026-11-02", arrivalDate: "2026-11-09" };
  const same = (change: Partial<LineDraft> = {}) => line({ fillIn: "both", sameActual: true, estimate: written, actual: { ...EMPTY_PHASE, quantity: "9" }, ...change });

  it("starts without the tick", () => {
    expect(newLineDraft(TODAY).sameActual).toBe(false);
  });

  it("gives both phases the same figures, so only the block of EXPECTED is read", () => {
    const { estimate, actual } = body(same()).figures!;
    expect(estimate).toEqual({ quantity: 2, unitNetCost: 5, fundIds: [2], supplierId: 7, purchaseDate: "2026-11-02", arrivalDate: "2026-11-09" });
    expect(actual).toEqual({ quantity: 2, unitNetCost: 5, fundIds: [2], supplierId: 7, purchaseDate: "2026-11-02" });
  });

  it("leaves the arrival date out of ACTUAL: it is worked out from what arrives", () => {
    expect(body(same()).figures!.actual).not.toHaveProperty("arrivalDate");
  });

  it("gives both phases the purchase date of today when it was not typed", () => {
    const empty = same({ estimate: { ...EMPTY_PHASE, quantity: "1" } });
    expect(body(empty).figures).toEqual({
      estimate: { quantity: 1, purchaseDate: TODAY },
      actual: { quantity: 1, purchaseDate: TODAY },
    });
  });

  it("sends the price typed with the VAT the same way to both", () => {
    const gross = same({ estimate: { ...written, priceMode: "gross", unitCost: "6.1" } });
    expect(body(gross).figures!.actual).toMatchObject({ unitGrossCost: 6.1 });
    expect(body(gross).figures!.actual).not.toHaveProperty("unitNetCost");
  });

  it("changes nothing without the tick, and the tick does not count unless both phases are filled in", () => {
    const apart = same({ sameActual: false });
    expect(body(apart).figures!.actual).toEqual({ quantity: 9, purchaseDate: TODAY });
    for (const fillIn of ["estimate", "actual"] as const) {
      expect(isSameActual(same({ fillIn }))).toBe(false);
      expect(Object.keys(body(same({ fillIn })).figures!)).toEqual([fillIn]);
    }
    expect(body(same({ fillIn: "actual" })).figures!.actual).toEqual({ quantity: 9, purchaseDate: TODAY });
  });
});

describe("withSameActual", () => {
  const typed = { ...EMPTY_PHASE, quantity: "2", fund: "Sponsor A", arrivalDate: "2026-11-09" };

  it("taking the tick off starts ACTUAL from what was written, without the arrival date", () => {
    const draft = line({ fillIn: "both", sameActual: true, estimate: typed, actual: { ...EMPTY_PHASE, quantity: "9" } });
    const apart = withSameActual(draft, false, []);
    expect(apart.sameActual).toBe(false);
    expect(apart.actual).toEqual({ ...typed, arrivalDate: "" });
    expect(apart.estimate).toEqual(typed);
  });

  it("putting it on keeps the fund if both phases offer it, and drops it if not", () => {
    const draft = line({ fillIn: "both", estimate: typed });
    expect(withSameActual(draft, true, ["sponsor a", "Team's fund"]).estimate.fund).toBe("Sponsor A");
    expect(withSameActual(draft, true, ["Team's fund"])).toMatchObject({ sameActual: true, estimate: { fund: "", quantity: "2" } });
  });
});

describe("fundsOfBoth", () => {
  const fund = (id: number) => ({ id, name: `Fund ${id}` }) as Fund;

  it("keeps the funds that are in both lists, by id, in the order of EXPECTED", () => {
    expect(fundsOfBoth({ funds: { estimate: [fund(3), fund(1), fund(2)], actual: [fund(2), fund(3), fund(9)] } }).map((f) => f.id)).toEqual([3, 2]);
  });

  it("is empty when no fund works in both", () => {
    expect(fundsOfBoth({ funds: { estimate: [fund(1)], actual: [fund(2)] } })).toEqual([]);
  });
});

describe("lineBody", () => {
  it("is the name and, for the phase chosen, the purchase date of today when nothing else is filled in", () => {
    expect(body(line({}))).toEqual({ item: "Sensor", figures: { estimate: { purchaseDate: TODAY } } });
  });

  it("takes the brand and the model only when something is typed in them, without the spaces around", () => {
    expect(body(line({ brand: " Bosch ", model: "GBH 2-26" }))).toMatchObject({ brand: "Bosch", model: "GBH 2-26" });
    expect(body(line({ brand: "Bosch" }))).not.toHaveProperty("model");
    expect(body(line({ brand: "  ", model: "" }))).not.toHaveProperty("brand");
    expect(body(line({}))).not.toHaveProperty("model");
  });

  it("takes the category and the priority only when chosen", () => {
    expect(body(line({ category: "Asset", priority: "High" }))).toMatchObject({ item: "Sensor", category: "Asset", priority: "High" });
    expect(body(line({}))).not.toHaveProperty("category");
  });

  it("takes the car only when another one than the season's is chosen", () => {
    expect(body(line({ car: "3" }))).toMatchObject({ carSeasonId: 3 });
    expect(body(line({}))).not.toHaveProperty("carSeasonId");
  });

  it("sends the numbers, the fund, the supplier and the dates of the phase that was chosen", () => {
    const estimate = { ...EMPTY_PHASE, quantity: "2", unitCost: "12.5", fund: "Sponsor A", supplier: "Amazon", purchaseDate: "2026-11-02", arrivalDate: "2026-11-09" };
    expect(body(line({ estimate })).figures).toEqual({
      estimate: { quantity: 2, unitNetCost: 12.5, fundIds: [2], supplierId: 7, purchaseDate: "2026-11-02", arrivalDate: "2026-11-09" },
    });
  });

  it("fills in one phase, the other or both, and leaves out the one that was not chosen even if something was typed in it", () => {
    const both = line({ estimate: { ...EMPTY_PHASE, quantity: "1" }, actual: { ...EMPTY_PHASE, quantity: "3" }, fillIn: "both" });
    expect(Object.keys(body(both).figures ?? {})).toEqual(["estimate", "actual"]);
    expect(body({ ...both, fillIn: "estimate" }).figures).toEqual({ estimate: { quantity: 1, purchaseDate: TODAY } });
    expect(body({ ...both, fillIn: "actual" }).figures).toEqual({ actual: { quantity: 3, purchaseDate: TODAY } });
  });

  it("gives a phase without a purchase date today's, and keeps the one that was typed", () => {
    const typed = { ...EMPTY_PHASE, purchaseDate: "2026-10-01" };
    expect(body(line({ estimate: { ...EMPTY_PHASE }, actual: typed, fillIn: "both" })).figures).toEqual({
      estimate: { purchaseDate: TODAY },
      actual: { purchaseDate: "2026-10-01" },
    });
  });

  it("starts with the purchase date of today in both phases and the arrival date empty", () => {
    const start = newLineDraft(TODAY);
    expect([start.estimate.purchaseDate, start.actual.purchaseDate, start.estimate.arrivalDate, start.actual.arrivalDate]).toEqual([TODAY, TODAY, "", ""]);
  });

  it("does not ask for an arrival date: the line is made without it", () => {
    expect(body(line({})).figures?.estimate).not.toHaveProperty("arrivalDate");
  });
});

describe("phaseFigures", () => {
  it("ignores a fund or a supplier that is not in the lists", () => {
    expect(phaseFigures({ ...EMPTY_PHASE, fund: "Nobody", supplier: "Nowhere" }, lookups)).toBeUndefined();
  });

  it("keeps the VAT rate only when the team's fund pays or nobody does yet", () => {
    const withRate = { ...EMPTY_PHASE, vatRate: "22" };
    expect(phaseFigures(withRate, lookups)).toEqual({ vatRate: 22 });
    expect(phaseFigures({ ...withRate, fund: "Team's fund" }, lookups)).toEqual({ vatRate: 22, fundIds: [1] });
    // a sponsor puts its own rate on the line: the one typed is not sent
    expect(phaseFigures({ ...withRate, fund: "Sponsor A" }, lookups)).toEqual({ fundIds: [2] });
  });

  it("lets a zero through: quantity 0 is something typed", () => {
    expect(phaseFigures({ ...EMPTY_PHASE, quantity: "0" }, lookups)).toEqual({ quantity: 0 });
    // a price typed with the VAT is sent as that, not as a net price
    expect(phaseFigures({ ...EMPTY_PHASE, quantity: "2", unitCost: "61", priceMode: "gross" }, lookups)).toEqual({ quantity: 2, unitGrossCost: 61 });
  });
});

describe("choosesOwnRate", () => {
  it("is true for no fund and for the team's fund, false for a sponsor", () => {
    expect([choosesOwnRate("", lookups), choosesOwnRate("team's FUND", lookups), choosesOwnRate("Sponsor A", lookups)]).toEqual([true, true, false]);
  });
});
