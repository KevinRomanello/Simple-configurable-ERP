import { describe, expect, it } from "vitest";
import type { CalcLine, PhaseCalc } from "../api/types";
import { decimalText, editDraft, linePatch } from "./lineEdit";

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
    fundName: names.fund ?? null,
    supplierName: names.supplier ?? null,
  }) as PhaseCalc;

const line = (estimate: PhaseCalc, actual: PhaseCalc = phase(null)): CalcLine =>
  ({ id: 5, version: 3, item: "Microcontroller", category: "Components", priority: null, carSeasonId: null, estimate, actual }) as CalcLine;

const bought = phase(
  { quantityMilli: 4000, unitCostE4: 124_000, vatRate: 22, fundIds: [1], supplierId: 7, purchaseDate: "2026-10-01" },
  { fund: "Team's fund", supplier: "RS Components" },
);

describe("decimalText", () => {
  it("writes the exact number, without trailing zeros", () => {
    expect(decimalText(4500, 3)).toBe("4.5");
    expect(decimalText(45, 4)).toBe("0.0045");
    expect(decimalText(124_000, 4)).toBe("12.4");
    expect(decimalText(3000, 3)).toBe("3");
    expect(decimalText(0, 3)).toBe("0");
  });
});

describe("editDraft", () => {
  it("starts from the line as it is; a phase with nothing typed is empty", () => {
    expect(editDraft(line(bought))).toEqual({
      item: "Microcontroller", category: "Components", priority: "", car: "",
      estimate: { quantity: "4", unitCost: "12.4", fund: "Team's fund", supplier: "RS Components", vatRate: "22", purchaseDate: "2026-10-01", arrivalDate: "" },
      actual: { quantity: "", unitCost: "", fund: "", supplier: "", vatRate: "", purchaseDate: "", arrivalDate: "" },
    });
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
