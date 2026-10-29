import { describe, expect, it } from "vitest";
import { choosesOwnRate, EMPTY_PHASE, lineBody, newLineDraft, phaseFigures, type LineDraft, type LineLookups } from "./newLine";

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

describe("lineBody", () => {
  it("is the name and, for the phase chosen, the purchase date of today when nothing else is filled in", () => {
    expect(body(line({}))).toEqual({ item: "Sensor", figures: { estimate: { purchaseDate: TODAY } } });
  });

  it("takes the category and the priority only when chosen", () => {
    expect(body(line({ category: "Asset", priority: "High" }))).toMatchObject({ item: "Sensor", category: "Asset", priority: "High" });
    expect(body(line({}))).not.toHaveProperty("category");
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
  });
});

describe("choosesOwnRate", () => {
  it("is true for no fund and for the team's fund, false for a sponsor", () => {
    expect([choosesOwnRate("", lookups), choosesOwnRate("team's FUND", lookups), choosesOwnRate("Sponsor A", lookups)]).toEqual([true, true, false]);
  });
});
