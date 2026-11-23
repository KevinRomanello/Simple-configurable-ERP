import { describe, expect, it } from "vitest";
import { missingMake, missingMakeText } from "./missingMake";

describe("the make and the model of a line", () => {
  it("says which of the two are missing, and nothing when both are written", () => {
    expect(missingMake({ brand: null, model: null })).toEqual(["BRAND", "MODEL"]);
    expect(missingMake({ brand: "Bosch", model: null })).toEqual(["MODEL"]);
    expect(missingMake({ brand: null, model: "GBH 2-26" })).toEqual(["BRAND"]);
    expect(missingMake({ brand: "Bosch", model: "GBH 2-26" })).toEqual([]);
  });

  it("writes the problem in words, with the names that are missing", () => {
    expect(missingMakeText(["BRAND", "MODEL"])).toMatch(/^BRAND and MODEL are missing/);
    expect(missingMakeText(["MODEL"])).toMatch(/^MODEL is missing/);
  });
});
