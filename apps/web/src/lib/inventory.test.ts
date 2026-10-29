import { describe, expect, it } from "vitest";
import type { CategoryFields, InventoryItem } from "../api/types";
import { draftBody, draftOf, emptyDraft, visibleFields } from "./inventory";

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

describe("draftBody", () => {
  it("trims, turns empty texts into nothing and sends only what the category shows", () => {
    const draft = { ...emptyDraft(), name: "  Epoxy  ", category: "Consumable", unit: "kg", safetyCodes: " H315 ", disposal: "", maintenanceNotes: "not shown here" };
    expect(draftBody(draft, fields)).toEqual({
      name: "Epoxy", code: null, category: "Consumable", unit: "kg",
      purpose: null, safetyCodes: "H315", disposal: null, storageNotes: null,
      flammable: false, toxic: false, carcinogenic: false,
    });
  });

  it("always sends the three hazard marks, ticked or not", () => {
    const body = draftBody({ ...emptyDraft(), name: "Acetone", category: "Consumable", flammable: true, carcinogenic: true }, fields);
    expect(body).toMatchObject({ flammable: true, toxic: false, carcinogenic: true });
  });

  it("leaves a hidden field alone: changing the category does not wipe what was written", () => {
    const body = draftBody({ ...emptyDraft(), name: "X", category: "Asset", safetyCodes: "H225" }, fields);
    expect(body).not.toHaveProperty("safetyCodes");
    expect(body).toHaveProperty("maintenanceNotes");
  });
});

describe("draftOf", () => {
  it("makes a draft from an item, with empty texts for what is not there", () => {
    const item = { id: 1, code: null, name: "Gloves", purpose: null, category: "Consumable", unit: "pcs", origin: "bought", safetyCodes: null, disposal: "General waste", storageNotes: null, maintenanceNotes: null, imageUpdatedAt: null, flammable: false, toxic: false, carcinogenic: false } satisfies InventoryItem;
    expect(draftOf(item)).toEqual({ ...emptyDraft(), name: "Gloves", category: "Consumable", disposal: "General waste" });
  });
});
