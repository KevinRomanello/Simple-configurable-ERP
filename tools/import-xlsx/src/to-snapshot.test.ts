import { describe, expect, it } from "vitest";
import { parseSponsorOption, slug } from "./to-snapshot";

describe("parseSponsorOption", () => {
  it("reads all nine options of the sheet's dropdown", () => {
    const expected: [string, string, number][] = [
      ["Total sponsorized without VAT", "total", 0],
      ["Total sponsorized with VAT (11%)", "total", 11],
      ["Total sponsorized with VAT (22%)", "total", 22],
      ["Partially sponsorized without VAT", "partial", 0],
      ["Partially sponsorized with VAT (11%)", "partial", 11],
      ["Partially sponsorized with VAT (22%)", "partial", 22],
      ["No sponsorized without VAT", "none", 0],
      ["No sponsorized with VAT (11%)", "none", 11],
      ["No sponsorized with VAT (22%)", "none", 22],
    ];
    for (const [text, type, rate] of expected) {
      expect(parseSponsorOption(text)).toEqual({ type, rate });
    }
  });

  it("rejects text that is not one of the options", () => {
    expect(parseSponsorOption("TRUE")).toBeNull();
  });
});

describe("slug", () => {
  it("makes the area codes used by the seed", () => {
    expect(slug("MT + DMT")).toBe("mt-dmt");
    expect(slug("SW")).toBe("sw");
  });
});
