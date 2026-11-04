import { describe, expect, it } from "vitest";
import type { CategoryFields, InventoryItem, ItemType } from "../api/types";
import { draftBody, draftOf, emptyDraft, paramErrors, visibleFields } from "./inventory";

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

const param = { typeId: 7, unit: null, prefixes: false, choices: [], filledIn: 0 };
const resistor: ItemType = {
  id: 7, name: "Resistor", areaId: 3, hazards: false, items: 0,
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
