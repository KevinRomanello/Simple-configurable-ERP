import { describe, expect, it } from "vitest";
import { areaSheet } from "./budget";
import { figures, line, snapshot, sponsorFund, teamFund } from "./fixtures";

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

  it("counts as the VAT of a total only what the team pays, not what a fund covers", () => {
    const paid = snapshot({
      funds: [teamFund, sponsorFund(2), sponsorFund(3, { type: "gift_vat", vatRate: 11 })],
      projects: [{ id: 1, areaId: 1, name: "Steering", ownerName: null, position: 1 }, { id: 2, areaId: 1, name: "Brakes", ownerName: null, position: 2 }],
      lines: [
        line(1, 1, figures(1, 100, { fundIds: [1] })), // the team's fund: it pays the 22.00 of VAT
        line(2, 1, figures(1, 100, { fundIds: [2] })), // a sponsor's fund covers its 22.00: not the team's
        line(3, 2, figures(1, 100, { fundIds: [3] })), // goods with a counter-invoice: the team pays the 11.00
        line(4, 2, figures(1, 100)), // no fund chosen yet: nobody pays it yet
      ],
    });
    const sheet = areaSheet(paid, "mt-dmt");
    const [steering, brakes] = sheet.projects;
    expect(steering!.subtotal.estimate).toMatchObject({ vatCents: 4_400, teamVatCents: 2_200 }); // 22 + 22, of which 22 the team's
    expect(brakes!.subtotal.estimate).toMatchObject({ vatCents: 3_300, teamVatCents: 1_100 }); // 11 + 22, of which 11 the team's
    expect(sheet.total.estimate).toMatchObject({ vatCents: 7_700, teamVatCents: 3_300, netCents: 40_000 });
    expect(sheet.total.actual.teamVatCents).toBe(0);
  });

  it("rejects an unknown area", () => {
    expect(() => areaSheet(s, "nope")).toThrow(/Unknown area/);
  });
});
