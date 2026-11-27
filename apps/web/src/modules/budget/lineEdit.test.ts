import { describe, expect, it } from "vitest";
import type { CalcLine, PhaseCalc } from "../../core/calcTypes";
import { editDraft, linePatch } from "./lineEdit";

const lookups = {
  fundByName: new Map([
    ["team's fund", { id: 1, kind: "team" as const }],
    ["acme", { id: 2, kind: "external" as const }],
  ]),
  supplierIdByName: new Map([["rs components", 7], ["mouser", 8]]),
};

const phase = (figures: Partial<NonNullable<PhaseCalc["figures"]>> | null, names: { fund?: string; supplier?: string } = {}): PhaseCalc =>
  ({
    figures: figures && {
      quantityMilli: 0, unitCostE4: 0, sponsorType: null, sponsorValueCents: null, vatRate: null, fundIds: [], supplierId: null,
      purchaseDate: null, arrivalDate: null, ...figures,
    },
    // the other way of the price: with 22% VAT on a price typed without it, the net of a price typed with it
    unitPriceE4: figures?.unitGrossE4 != null ? { net: Math.round(figures.unitGrossE4 / 1.22), gross: figures.unitGrossE4 } : { net: figures?.unitCostE4 ?? 0, gross: Math.round((figures?.unitCostE4 ?? 0) * 1.22) },
    fundName: names.fund ?? null,
    supplierName: names.supplier ?? null,
  }) as PhaseCalc;

const line = (estimate: PhaseCalc, actual: PhaseCalc = phase(null)): CalcLine =>
  ({ id: 5, version: 3, item: "Microcontroller", category: "Components", priority: null, carSeasonId: null, estimate, actual }) as CalcLine;

const bought = phase(
  { quantityMilli: 4000, unitCostE4: 124_000, vatRate: 22, fundIds: [1], supplierId: 7, purchaseDate: "2026-10-01" },
  { fund: "Team's fund", supplier: "RS Components" },
);

describe("editDraft", () => {
  it("starts from the line as it is; a phase with nothing typed is empty", () => {
    expect(editDraft(line(bought))).toEqual({
      item: "Microcontroller", brand: "", model: "", category: "Components", priority: "", car: "",
      estimate: { quantity: "4", unitCost: "12.4", priceMode: "net", otherCost: "15.128", fund: "Team's fund", supplier: "RS Components", vatRate: "22", purchaseDate: "2026-10-01", arrivalDate: "" },
      actual: { quantity: "", unitCost: "", priceMode: "net", otherCost: "", fund: "", supplier: "", vatRate: "", purchaseDate: "", arrivalDate: "" },
    });
  });
});

describe("the brand and the model", () => {
  const made = { ...line(bought), brand: "Bosch", model: "GBH 2-26" } as CalcLine;

  it("start from the line as it is, empty when it has none", () => {
    expect(editDraft(made)).toMatchObject({ brand: "Bosch", model: "GBH 2-26" });
    expect(editDraft(line(bought))).toMatchObject({ brand: "", model: "" });
    expect(editDraft({ ...line(bought), brand: null, model: null } as CalcLine)).toMatchObject({ brand: "", model: "" });
  });

  it("are sent only when they changed, one at a time", () => {
    expect(linePatch(editDraft(made), made, lookups)).toEqual({ version: 3 });
    expect(linePatch({ ...editDraft(made), model: " GBH 18V " }, made, lookups)).toEqual({ version: 3, model: "GBH 18V" });
    expect(linePatch({ ...editDraft(made), brand: "Makita" }, made, lookups)).toEqual({ version: 3, brand: "Makita" });
  });

  it("are taken away with an empty box, even one with only spaces", () => {
    expect(linePatch({ ...editDraft(made), brand: "", model: "   " }, made, lookups)).toEqual({ version: 3, brand: null, model: null });
  });

  it("are not a change when only spaces around them were typed", () => {
    expect(linePatch({ ...editDraft(made), brand: " Bosch " }, made, lookups)).toEqual({ version: 3 });
  });
});

describe("linePatch", () => {
  it("sends only the version when nothing changed", () => {
    expect(linePatch(editDraft(line(bought)), line(bought), lookups)).toEqual({ version: 3 });
  });

  it("sends what changed: texts, numbers, a fund and a supplier by their id, emptied dates as nothing", () => {
    const draft = editDraft(line(bought));
    draft.item = " Microcontroller STM32 ";
    draft.priority = "High";
    draft.estimate = { ...draft.estimate, quantity: "6", fund: "Acme", supplier: "Mouser", purchaseDate: "" };
    draft.actual = { ...draft.actual, quantity: "6", unitCost: "11.9" };
    expect(linePatch(draft, line(bought), lookups)).toEqual({
      version: 3,
      item: "Microcontroller STM32",
      priority: "High",
      figures: {
        estimate: { quantity: 6, fundIds: [2], supplierId: 8, purchaseDate: null },
        actual: { quantity: 6, unitNetCost: 11.9 },
      },
    });
  });

  it("makes an emptied quantity 0 and clears an emptied fund, supplier and rate", () => {
    const draft = editDraft(line(bought));
    draft.estimate = { ...draft.estimate, quantity: "", fund: "", supplier: "", vatRate: "" };
    expect(linePatch(draft, line(bought), lookups).figures?.estimate).toEqual({ quantity: 0, fundIds: [], supplierId: null, vatRate: null });
  });

  it("never touches the funds of a line paid by several of them, nor a name that is not in the lists", () => {
    const shared = phase({ quantityMilli: 1000, fundIds: [2, 1] }, { fund: "Acme + Team's fund" });
    const draft = editDraft(line(shared));
    expect(draft.estimate.fund).toBe("");
    draft.estimate = { ...draft.estimate, fund: "Acme", supplier: "Nobody we know" };
    expect(linePatch(draft, line(shared), lookups)).toEqual({ version: 3 });
  });

  it("sends the car chosen for the line, and null to go back to the car of its season", () => {
    const draft = editDraft(line(bought));
    draft.car = "4";
    expect(linePatch(draft, line(bought), lookups)).toEqual({ version: 3, carSeasonId: 4 });
    const old = { ...line(bought), carSeasonId: 4 } as CalcLine;
    expect(editDraft(old).car).toBe("4");
    expect(linePatch({ ...editDraft(old), car: "" }, old, lookups)).toEqual({ version: 3, carSeasonId: null });
  });

  it("leaves the VAT rate alone when a sponsor's fund brings its own", () => {
    const draft = editDraft(line(bought));
    draft.estimate = { ...draft.estimate, fund: "Acme", vatRate: "10" };
    expect(linePatch(draft, line(bought), lookups).figures?.estimate).toEqual({ fundIds: [2] });
  });
});

describe("a price typed with the VAT", () => {
  const withVat = phase({ quantityMilli: 1000, unitCostE4: 0, unitGrossE4: 1_220_000, vatRate: 22, sponsorType: "none" }, { fund: "Team's fund" });

  it("starts from the price as it was typed, with the net kept for when the person switches", () => {
    expect(editDraft(line(withVat)).estimate).toMatchObject({ unitCost: "122", priceMode: "gross", otherCost: "100" });
  });

  it("sends the price with VAT when it is typed, and the net price when the person switches back and types it", () => {
    const draft = editDraft(line(bought));
    draft.estimate = { ...draft.estimate, unitCost: "15", priceMode: "gross" };
    expect(linePatch(draft, line(bought), lookups).figures).toEqual({ estimate: { unitGrossCost: 15 } });

    const back = editDraft(line(withVat));
    back.estimate = { ...back.estimate, unitCost: "90", priceMode: "net" };
    expect(linePatch(back, line(withVat), lookups).figures).toEqual({ estimate: { unitNetCost: 90 } });
  });

  it("switching the kind of price only sends it said the other way", () => {
    const draft = editDraft(line(bought));
    draft.estimate = { ...draft.estimate, priceMode: "gross", unitCost: draft.estimate.otherCost, otherCost: draft.estimate.unitCost };
    expect(linePatch(draft, line(bought), lookups).figures).toEqual({ estimate: { unitGrossCost: 15.128 } });
  });
});
