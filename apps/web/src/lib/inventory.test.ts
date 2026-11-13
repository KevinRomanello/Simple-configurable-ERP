import { describe, expect, it } from "vitest";
import type { CategoryFields, InventoryItem, ItemType } from "../api/types";
import { categoryOf, draftBody, draftOf, emptyDraft, paramErrors, visibleFields } from "./inventory";

const fields: CategoryFields = {
  fallback: ["purpose", "storageNotes"],
  byCategory: { Consumable: ["purpose", "safetyCodes", "disposal", "storageNotes"], Asset: ["purpose", "maintenanceNotes"] },
};

describe("visibleFields", () => {
  it("shows the fields of the category, and the general ones for any other", () => {
    expect(visibleFields("Consumable", fields)).toContain("safetyCodes");
    expect(visibleFields("Asset", fields)).toEqual(["purpose", "maintenanceNotes"]);
    expect(visibleFields("Unknown", fields)).toEqual(["purpose", "storageNotes"]);
    expect(visibleFields("", fields)).toEqual(["purpose", "storageNotes"]);
    expect(visibleFields(null, fields)).toEqual(["purpose", "storageNotes"]);
  });
});

const param = { typeId: 7, unit: null, prefixes: false, choices: [], filledIn: 0, inherited: false };
const resistor: ItemType = {
  id: 7, name: "Resistor", parentId: null, depth: 0, path: "Resistor", areaId: 3, hazards: false, categoryId: 2, category: "Asset", items: 0,
  params: [
    { ...param, id: 1, name: "Resistance", kind: "number", unit: "Ω", prefixes: true, position: 1 },
    { ...param, id: 2, name: "Package", kind: "list", choices: ["0603", "0805"], position: 2 },
    { ...param, id: 3, name: "Series", kind: "text", position: 3 },
    { ...param, id: 4, name: "RoHS", kind: "yesno", position: 4 },
  ],
};
const lookups = { fields, types: [resistor] };

describe("draftBody", () => {
  it("trims, turns empty texts into nothing and sends only what the category shows", () => {
    const draft = { ...emptyDraft(), name: "  Epoxy  ", category: "Consumable", unit: "kg", safetyCodes: " H315 ", disposal: "", maintenanceNotes: "not shown here" };
    expect(draftBody(draft, lookups)).toEqual({
      name: "Epoxy", code: null, category: "Consumable", areaId: null, typeId: null, unit: "kg",
      purpose: null, safetyCodes: "H315", disposal: null, storageNotes: null,
      flammable: false, toxic: false, carcinogenic: false,
    });
  });

  it("sends the three hazard marks, ticked or not, unless the type does not ask them (then they keep what they had)", () => {
    const body = draftBody({ ...emptyDraft(), name: "Acetone", category: "Consumable", flammable: true, carcinogenic: true }, lookups);
    expect(body).toMatchObject({ flammable: true, toxic: false, carcinogenic: true });
    expect(draftBody({ ...emptyDraft(), name: "R", typeId: "7", flammable: true }, lookups)).not.toHaveProperty("flammable");
  });

  it("sends every parameter of the type: numbers read exactly, empty ones cleared, yes or no always", () => {
    const draft = { ...emptyDraft(), name: "R 4k7", areaId: "3", typeId: "7", values: { 1: "4k7", 2: "0603", 3: "  " } };
    expect(draftBody(draft, lookups)).toMatchObject({
      areaId: 3, typeId: 7,
      params: [{ paramId: 1, value: "4700" }, { paramId: 2, value: "0603" }, { paramId: 3, value: null }, { paramId: 4, value: false }],
    });
    expect(draftBody({ ...emptyDraft(), name: "X" }, lookups)).not.toHaveProperty("params"); // no type, nothing to say
  });

  it("leaves a hidden field alone: changing the category does not wipe what was written", () => {
    const body = draftBody({ ...emptyDraft(), name: "X", category: "Asset", safetyCodes: "H225" }, lookups);
    expect(body).not.toHaveProperty("safetyCodes");
    expect(body).toHaveProperty("maintenanceNotes");
  });
});

describe("paramErrors", () => {
  it("names the numbers that cannot be read, and nothing else", () => {
    const draft = { ...emptyDraft(), typeId: "7", values: { 1: "ten", 3: "anything" } };
    expect(Object.keys(paramErrors(draft, [resistor]))).toEqual(["1"]);
    expect(paramErrors({ ...draft, values: { 1: "10k" } }, [resistor])).toEqual({});
  });
});

describe("draftOf", () => {
  const item = {
    id: 1, code: null, name: "Gloves", purpose: null, category: "Consumable", areaId: null, typeId: null, unit: "pcs", origin: "bought",
    safetyCodes: null, disposal: "General waste", storageNotes: null, maintenanceNotes: null, imageUpdatedAt: null, flammable: false, toxic: false, carcinogenic: false,
  } satisfies InventoryItem;

  it("makes a draft from an item, with empty texts for what is not there", () => {
    expect(draftOf(item, {}, [])).toEqual({ ...emptyDraft(), name: "Gloves", category: "Consumable", disposal: "General waste" });
  });

  it("writes the numbers of its type the way they are typed, so that saving again changes nothing", () => {
    const draft = draftOf({ ...item, areaId: 3, typeId: 7 }, { 1: "4700", 2: "0603", 4: true }, [resistor]);
    expect(draft).toMatchObject({ areaId: "3", typeId: "7", values: { 1: "4.7k", 2: "0603", 4: true } });
    expect(draftBody(draft, lookups).params).toContainEqual({ paramId: 1, value: "4700" });
  });
});

describe("categoryOf", () => {
  const unlinked: ItemType = { ...resistor, id: 8, category: null, categoryId: null };
  const types = [resistor, unlinked];

  it("is the category of the type of the item: the form does not ask it", () => {
    expect(categoryOf({ ...emptyDraft(), typeId: "7", category: "Consumable" }, types)).toBe("Asset");
    expect(draftBody({ ...emptyDraft(), name: "R", typeId: "7", category: "Consumable" }, { fields, types })).toMatchObject({ category: "Asset" });
  });

  it("is the item's own for one without a type, or of a type that has none yet", () => {
    expect(categoryOf({ ...emptyDraft(), category: "Logistic" }, types)).toBe("Logistic");
    expect(categoryOf({ ...emptyDraft(), typeId: "8", category: "Logistic" }, types)).toBe("Logistic");
    expect(categoryOf(emptyDraft(), types)).toBeNull();
  });

  it("decides the optional fields of the form: the ones of the category of the type", () => {
    const draft = { ...emptyDraft(), name: "R", typeId: "7", maintenanceNotes: " yearly ", safetyCodes: "H315" };
    // Asset shows maintenance, not safety codes
    expect(draftBody(draft, { fields, types })).toMatchObject({ maintenanceNotes: "yearly" });
    expect(draftBody(draft, { fields, types })).not.toHaveProperty("safetyCodes");
  });
});

describe("a type under another", () => {
  // IC has Package; Op-amp is under it and adds Gain; the form of an op-amp writes both
  const ic = { ...param, typeId: 20, id: 20, name: "Package", kind: "text" as const, position: 1, inherited: true };
  const gain = { ...param, typeId: 21, id: 21, name: "Gain", kind: "text" as const, position: 1 };
  const opamp: ItemType = { ...resistor, id: 21, name: "Op-amp", parentId: 20, depth: 1, path: "IC › Op-amp", hazards: true, params: [ic, gain] };

  it("sends the parameters of the parents too, and the draft reads them back", () => {
    const draft = { ...emptyDraft(), name: "LM358", typeId: "21", values: { 20: "SOIC-8", 21: "wide" } };
    expect(draftBody(draft, { fields, types: [opamp] }).params).toEqual([{ paramId: 20, value: "SOIC-8" }, { paramId: 21, value: "wide" }]);
    const item = { id: 1, name: "LM358", code: null, category: null, areaId: null, typeId: 21, unit: "pcs", purpose: null, safetyCodes: null, disposal: null, storageNotes: null, maintenanceNotes: null, flammable: false, toxic: false, carcinogenic: false, origin: "bought" } as unknown as InventoryItem;
    expect(draftOf(item, { 20: "SOIC-8", 21: "wide" }, [opamp]).values).toEqual({ 20: "SOIC-8", 21: "wide" });
  });
});
