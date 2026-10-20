import { describe, expect, it } from "vitest";
import { areaSheet } from "./budget";
import { figures, line, snapshot } from "./fixtures";

const s = snapshot({
  projects: [
    { id: 1, areaId: 1, name: "Steering", ownerName: "Someone", position: 1 },
    { id: 2, areaId: 1, name: "Brakes", ownerName: null, position: 2 },
    { id: 3, areaId: 2, name: "Elsewhere", ownerName: null, position: 1 },
  ],
  lines: [
    line(1, 1, figures(10, 100), figures(10, 90)), // est gross 1220.00, act gross 1098.00
    line(2, 1, figures(1, 50, { vatRate: 0 })), // est 50.00
    line(3, 2, null),
    line(4, 3, figures(1, 999)), // other area: must not leak in
  ],
});

describe("areaSheet", () => {
  const sheet = areaSheet(s, "mt-dmt");

  it("lists the projects of the area with their owner and lines", () => {
    expect(sheet.area.name).toBe("MT + DMT");
    expect(sheet.projects.map((p) => [p.name, p.ownerName, p.lines.length])).toEqual([
      ["Steering", "Someone", 2],
      ["Brakes", null, 1],
    ]);
  });

  it("subtotals each project per phase", () => {
    const steering = sheet.projects[0]!;
    expect(steering.subtotal.estimate.netCents).toBe(100_000 + 5_000);
    expect(steering.subtotal.estimate.vatCents).toBe(22_000);
    expect(steering.subtotal.estimate.grossCents).toBe(122_000 + 5_000);
    expect(steering.subtotal.actual.grossCents).toBe(109_800);
  });

  it("totals the area as the sum of its projects", () => {
    expect(sheet.total.estimate.outflowCents).toBe(127_000);
    expect(sheet.total.actual.outflowCents).toBe(109_800);
  });

  it("rejects an unknown area", () => {
    expect(() => areaSheet(s, "nope")).toThrow(/Unknown area/);
  });
});
