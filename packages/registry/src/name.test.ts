import { describe, expect, it } from "vitest";
import { FIELD_TYPES, NAME_TYPES, canBeName } from "./types";

describe("the field that names the records", () => {
  it("is one with a single value that reads as a name", () => {
    for (const type of ["text", "longtext", "email", "number", "date", "select", "formula", "autonumber"] as const) expect([type, canBeName(type)]).toEqual([type, true]);
  });

  it("is never a link, a lookup, a rollup, several choices, a person, a file, a button, JSON, a code or a tick", () => {
    for (const type of ["link", "lookup", "rollup", "multiselect", "user", "attachment", "button", "json", "qrcode", "barcode", "geodata", "color", "checkbox", "rating"] as const) {
      expect([type, canBeName(type)]).toEqual([type, false]);
    }
  });

  it("only lists types that exist", () => {
    for (const type of NAME_TYPES) expect(FIELD_TYPES).toContain(type);
  });
});
