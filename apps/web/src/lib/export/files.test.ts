import { describe, expect, it } from "vitest";
import { fileBase, sheetName } from "./files";

describe("sheetName", () => {
  it("takes out what Excel does not allow and keeps to 31 characters", () => {
    expect(sheetName("VAT OUTFLOW / PROJECT", new Set())).toBe("VAT OUTFLOW PROJECT");
    expect(sheetName("[a]:b*c?d\\e", new Set())).toBe("a b c d e");
    expect(sheetName("x".repeat(40), new Set())).toHaveLength(31);
  });

  it("never gives the same name twice, whatever the case", () => {
    const used = new Set<string>();
    expect(sheetName("Totals", used)).toBe("Totals");
    expect(sheetName("TOTALS", used)).toBe("TOTALS (2)");
    expect(sheetName("totals", used)).toBe("totals (3)");
  });

  it("keeps a long name unique inside the 31 characters", () => {
    const used = new Set<string>();
    sheetName("y".repeat(40), used);
    const second = sheetName("y".repeat(40), used);
    expect(second).toHaveLength(31);
    expect(second.endsWith(" (2)")).toBe(true);
  });

  it("does not use the name Excel keeps for itself, nor an apostrophe at either end", () => {
    const used = new Set<string>();
    expect(sheetName("History", used)).toBe("History (2)");
    expect(sheetName("'Team's fund'", used)).toBe("Team's fund");
  });

  it("has a name even when nothing is left", () => {
    expect(sheetName("///", new Set())).toBe("Sheet");
  });
});

describe("fileBase", () => {
  it("makes a file name from the page title and the day", () => {
    expect(fileBase("EXPECTED GANTT", "2026-10-23")).toBe("expected-gantt-2026-10-23");
    expect(fileBase("MT + DMT", "2026-10-23")).toBe("mt-dmt-2026-10-23");
    expect(fileBase("Città & più", "2026-10-23")).toBe("citta-piu-2026-10-23");
  });

  it("has a name even without a title", () => {
    expect(fileBase("", "2026-10-23")).toBe("export-2026-10-23");
  });
});
