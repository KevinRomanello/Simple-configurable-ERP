import { describe, expect, it } from "vitest";
import { figures, line, snapshot } from "./fixtures";
import { totals } from "./totals";

const s = snapshot({
  projects: [
    { id: 1, areaId: 1, name: "A", ownerName: null, position: 1 },
    { id: 2, areaId: 2, name: "B", ownerName: null, position: 1 },
  ],
  lines: [
    // area 1, Components: estimate outflow 1220.00, actual 1342.00 (+10%)
    line(1, 1, figures(10, 100), figures(10, 110), { category: "Components" }),
    // area 1, no category: only the ALL block sees it
    line(2, 1, figures(1, 100, { vatRate: 0 }), null),
    // area 2, Asset: estimate 1000.00 with a 400.00 sponsor, actual 2000.00 (+233% on outflow)
    line(
      3,
      2,
      figures(10, 100, { sponsorType: "partial", sponsorValueCents: 40_000, vatRate: 0 }),
      figures(20, 100, { sponsorType: "partial", sponsorValueCents: 40_000, vatRate: 0 }),
      { category: "Asset" },
    ),
  ],
});

describe("totals", () => {
  const result = totals(s);
  const block = (name: string) => result.blocks.find((b) => b.block === name)!;
  const row = (name: string, area: string) => block(name).rows.find((r) => r.areaName === area)!;

  it("has the ALL block plus one block per category, with a row per area", () => {
    expect(result.blocks.map((b) => b.block)).toEqual([
      "ALL", "Components", "Manufacturing", "Consumable", "Asset", "Logistic", "Administration", "Software",
    ]);
    expect(block("ALL").rows).toHaveLength(6);
  });

  it("sums gross, sponsor and outflow for both phases", () => {
    expect(row("ALL", "HW")).toMatchObject({ estimateGrossCents: 0, actualOutflowCents: 0 });
    expect(row("ALL", "SW")).toMatchObject({
      estimateGrossCents: 100_000,
      estimateSponsorCents: 40_000,
      estimateOutflowCents: 60_000,
      actualGrossCents: 200_000,
      actualOutflowCents: 160_000,
    });
  });

  it("puts a line in a category block only if its category matches", () => {
    expect(row("Components", "MT + DMT").estimateGrossCents).toBe(122_000);
    expect(row("ALL", "MT + DMT").estimateGrossCents).toBe(122_000 + 10_000);
    expect(block("Software").total.estimateGrossCents).toBe(0);
  });

  it("computes the variance as (actual - estimate) / estimate and leaves it empty on a zero estimate", () => {
    expect(row("Components", "MT + DMT").outflowVariance).toBeCloseTo(0.1, 10);
    expect(row("Components", "MT + DMT").sponsorVariance).toBeNull();
    expect(row("ALL", "HW").outflowVariance).toBeNull();
  });

  it("flags only variances beyond the threshold", () => {
    expect(row("Components", "MT + DMT").outflowOutOfRange).toBe(false); // +10%
    expect(row("Asset", "SW").outflowOutOfRange).toBe(true); // +166%
    expect(row("Asset", "SW").sponsorOutOfRange).toBe(false); // sponsor unchanged
    expect(result.threshold).toBe(0.15);
  });

  it("marks the total outflow green when the actual stays within the estimate, red otherwise", () => {
    expect(block("Asset").total.outflowStatus).toBe("over");
    expect(block("Software").total.outflowStatus).toBe("within"); // 0 <= 0
    const cheaper = totals(
      snapshot({
        projects: [{ id: 1, areaId: 1, name: "A", ownerName: null, position: 1 }],
        lines: [line(1, 1, figures(1, 100), figures(1, 50))],
      }),
    );
    expect(cheaper.blocks[0]!.total.outflowStatus).toBe("within");
  });
});
