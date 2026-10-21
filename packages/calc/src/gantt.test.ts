import { describe, expect, it } from "vitest";
import { figures, line, settings, snapshot, sponsorFund, teamFund as team } from "./fixtures";
import { gantt } from "./gantt";
import type { Snapshot } from "./snapshot";

// The scenario of docs/regole-script-attuale.md, section 17: BANK 5 000.00 on 15 Nov 2026,
// inflows of 2 000.00 (10 Nov) and 1 000.00 (5 Dec), one team-fund purchase on 20 Nov with
// outflow 600.00 of which 100.00 VAT (due 16 Feb 2027).
function scenario(overrides: Partial<Snapshot> = {}): Snapshot {
  return snapshot({
    projects: [{ id: 1, areaId: 1, name: "P", ownerName: null, position: 1 }],
    bank: { amountCents: 500_000, asOfDate: "2026-11-15" },
    inflows: [
      { id: 1, phase: "estimate", sourceName: "X", amountCents: 200_000, inflowDate: "2026-11-10" },
      { id: 2, phase: "estimate", sourceName: "Y", amountCents: 100_000, inflowDate: "2026-12-05" },
    ],
    lines: [
      line(1, 1, figures(1, 500, { fundIds: [1], vatRate: 20, purchaseDate: "2026-11-20" }), null, {
        category: "Asset",
      }),
    ],
    ...overrides,
  });
}

describe("gantt: Team's fund table", () => {
  it("builds the running balance month by month (the BANK month's own movements are excluded)", () => {
    const { months, teamFund } = gantt(scenario(), "estimate");
    expect(months).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(teamFund.rows.map((r) => [r.inflowCents, r.outflowAllCents, r.outflowVatCents, r.finalCents])).toEqual([
      [500_000, 0, 0, 500_000], // BANK only: the 10 Nov inflow and 20 Nov purchase are in the balance
      [100_000, 0, 0, 600_000],
      [0, 0, 0, 600_000],
      [0, 10_000, 10_000, 590_000], // VAT due 16 Feb
    ]);
  });

  it("open question Q2: comparing by day also counts the purchase made later in the BANK's month", () => {
    const s = scenario();
    s.lookups = {
      ...s.lookups,
      settings: { ...settings, bankCompare: { summary: "day", timeline: "day" } },
    };
    const { teamFund } = gantt(s, "estimate");
    expect(teamFund.rows[0]).toMatchObject({ outflowAllCents: 50_000, finalCents: 450_000 });
    expect(teamFund.rows.at(-1)!.finalCents).toBe(540_000); // matches the summary's left value
  });

  it("splits team purchases by category, without the VAT", () => {
    const s = scenario({ bank: null });
    const { teamFund } = gantt(s, "estimate");
    expect(teamFund.rows[0]!.outflowByCategory).toMatchObject({ Asset: 50_000, Components: 0 });
    expect(teamFund.rows[0]!.outflowAllCents).toBe(50_000);
  });

  it("without a BANK it starts from zero, counts every inflow and has no blank months", () => {
    const { teamFund } = gantt(scenario({ bank: null }), "estimate");
    expect(teamFund.rows.map((r) => r.finalCents)).toEqual([150_000, 250_000, 250_000, 240_000]);
  });

  it("a BANK without a date is the starting balance of the whole timeline", () => {
    const s = scenario({ bank: { amountCents: 500_000, asOfDate: null } });
    const { teamFund } = gantt(s, "estimate");
    expect(teamFund.rows[0]!.finalCents).toBe(500_000 + 200_000 - 50_000);
    expect(teamFund.rows.at(-1)!.finalCents).toBe(500_000 + 300_000 - 60_000);
  });

  it("leaves the months before the BANK date blank", () => {
    const s = scenario({
      inflows: [{ id: 1, phase: "estimate", sourceName: "X", amountCents: 1, inflowDate: "2026-09-10" }],
    });
    const { teamFund } = gantt(s, "estimate");
    expect(teamFund.rows.map((r) => r.finalCents)).toEqual([null, null, 500_000, 500_000, 500_000, 490_000]);
  });

  it("counts only the VAT the team pays, whichever fund it comes from", () => {
    const s = scenario({
      funds: [
        team,
        sponsorFund(2, { name: "Sponsor", vatRate: 20 }),
      ],
      lines: [line(1, 1, figures(1, 500, { fundIds: [2], purchaseDate: "2026-11-20" }))],
    });
    const { teamFund } = gantt(s, "estimate");
    // the sponsor's purchase is not a team outflow, but its uncovered VAT is
    expect(teamFund.rows.at(-1)).toMatchObject({ outflowAllCents: 10_000, outflowVatCents: 10_000 });
  });
});

describe("gantt: tables by area and project", () => {
  const s = snapshot({
    projects: [
      { id: 1, areaId: 1, name: "Steering", ownerName: null, position: 1 },
      { id: 2, areaId: 1, name: "Brakes", ownerName: null, position: 2 },
      { id: 3, areaId: 2, name: "IT", ownerName: null, position: 1 },
    ],
    lines: [
      line(1, 1, figures(1, 100, { fundIds: [1], purchaseDate: "2026-10-05" }), null, { category: "Asset" }),
      line(2, 1, figures(1, 100, { fundIds: [1], purchaseDate: "2026-12-05" }), null, { category: "Components" }),
      line(3, 2, figures(1, 50, { vatRate: 0, purchaseDate: "2026-10-20" }), null, { category: "Asset" }),
      line(4, 2, figures(1, 999), null), // no purchase date: not on the timeline
      line(5, 3, figures(1, 10, { vatRate: 0, purchaseDate: "2026-11-02" }), null),
    ],
  });
  const result = gantt(s, "estimate");
  const all = result.blocks.find((b) => b.block === "ALL")!;

  it("spans the months from the first to the last movement, VAT deadlines included", () => {
    // purchases Oct-Dec 2026; the team's VAT of the Dec purchase is due 16 Feb 2027
    expect(result.months).toEqual(["2026-10", "2026-11", "2026-12", "2027-01", "2027-02"]);
  });

  it("lists projects with a dated purchase and puts the VAT row last in each area", () => {
    expect(all.areas.map((a) => a.areaName)).toEqual(["MT + DMT", "SW"]);
    expect(all.areas[0]!.rows.map((r) => r.name)).toEqual(["Steering", "Brakes", "VAT Outflow"]);
  });

  it("books a purchase whose VAT the team pays net of that VAT, and the VAT on its deadline", () => {
    const steering = all.areas[0]!.rows[0]!;
    expect(steering.byMonth).toEqual({ "2026-10": 10_000, "2026-12": 10_000 }); // net only
    const vat = all.areas[0]!.rows[2]!;
    expect(vat.byMonth).toEqual({ "2027-02": 4_400 }); // Oct purchase -> 16 Feb 2027, Dec -> 16 Feb too
  });

  it("sums per project, per area and per block", () => {
    const area = all.areas[0]!;
    expect(area.monthlySum["2026-10"]).toBe(10_000 + 5_000);
    expect(area.sumCents).toBe(10_000 + 10_000 + 5_000 + 4_400);
    expect(all.total.sumCents).toBe(area.sumCents + 1_000);
  });

  it("repeats the tables per category and leaves out categories without movements", () => {
    expect(result.blocks.map((b) => b.block)).toEqual(["ALL", "Components", "Asset"]);
    const asset = result.blocks.find((b) => b.block === "Asset")!;
    expect(asset.areas[0]!.rows.map((r) => r.name)).toEqual(["Steering", "Brakes", "VAT Outflow"]);
    expect(asset.total.byMonth).toEqual({ "2026-10": 15_000, "2027-02": 2_200 });
  });

  it("is empty when nothing has a date", () => {
    const empty = gantt(snapshot({ projects: [], lines: [] }), "actual");
    expect(empty).toMatchObject({ months: [], blocks: [] });
    expect(empty.teamFund.rows).toEqual([]);
  });
});
