import { describe, expect, it } from "vitest";
import { analysisByFund, analysisBySupplier } from "./analysis";
import { figures, line, snapshot, sponsorFund, teamFund } from "./fixtures";
import type { FundInput } from "./snapshot";

const fundA: FundInput = sponsorFund(2, { name: "Alpha", paysVat: false });
const fundB: FundInput = sponsorFund(3, { name: "beta", paysVat: true });

const s = snapshot({
  projects: [{ id: 1, areaId: 1, name: "P", ownerName: null, position: 1 }],
  funds: [
    teamFund,
    fundA,
    fundB,
  ],
  contracts: [
    { id: 1, fundId: 2, phase: "estimate", amountCents: 100, inflowDate: null },
    { id: 2, fundId: 3, phase: "actual", amountCents: 100, inflowDate: null },
  ],
  suppliers: [
    { id: 1, name: "Amazon" },
    { id: 2, name: "Farnell" },
  ],
  lines: [
    // Alpha does not cover VAT: outflow 1220.00 counts as 1000.00 for the fund, in both phases
    line(1, 1, figures(10, 100, { fundIds: [2], supplierId: 1 }), figures(10, 100, { fundIds: [2], supplierId: 2 }), {
      category: "Asset",
    }),
    line(2, 1, figures(1, 100, { fundIds: [1], supplierId: 1, vatRate: 0 }), null),
  ],
});

describe("analysisByFund", () => {
  const analysis = analysisByFund(s);

  it("lists contract funds and used funds, sorted without regard to case, aligned across phases", () => {
    expect(analysis.names).toEqual([
      { estimate: "Alpha", actual: "Alpha" },
      { estimate: null, actual: "beta" }, // contract only in the actual phase
      { estimate: "Team's fund", actual: null },
    ]);
  });

  it("drops the VAT from the outflow of a fund that does not cover it", () => {
    const all = analysis.blocks.find((b) => b.block === "ALL")!;
    expect(all.rows[0]!.estimate).toEqual({ grossCents: 122_000, sponsorCents: 0, outflowCents: 100_000 });
    expect(all.rows[0]!.actual).toEqual({ grossCents: 122_000, sponsorCents: 0, outflowCents: 100_000 });
  });

  it("keeps the team fund's VAT in its outflow", () => {
    const all = analysis.blocks.find((b) => b.block === "ALL")!;
    expect(all.rows[2]!.estimate).toEqual({ grossCents: 10_000, sponsorCents: 0, outflowCents: 10_000 });
  });

  it("shows funds without lines as zeros, and no cell for a phase where the name does not exist", () => {
    const all = analysis.blocks.find((b) => b.block === "ALL")!;
    expect(all.rows[1]!.estimate).toBeNull();
    expect(all.rows[1]!.actual).toEqual({ grossCents: 0, sponsorCents: 0, outflowCents: 0 });
  });

  it("filters by category and totals each column", () => {
    const asset = analysis.blocks.find((b) => b.block === "Asset")!;
    expect(asset.rows[0]!.estimate!.grossCents).toBe(122_000);
    expect(asset.rows[2]!.estimate!.grossCents).toBe(0); // the team's line has no category
    expect(asset.total.estimate.outflowCents).toBe(100_000);
    const all = analysis.blocks.find((b) => b.block === "ALL")!;
    expect(all.total.estimate.outflowCents).toBe(110_000);
  });
});

describe("analysisBySupplier", () => {
  it("groups by supplier, using only suppliers that appear in a phase", () => {
    const analysis = analysisBySupplier(s);
    expect(analysis.names).toEqual([
      { estimate: "Amazon", actual: null },
      { estimate: null, actual: "Farnell" },
    ]);
    const all = analysis.blocks.find((b) => b.block === "ALL")!;
    expect(all.rows[0]!.estimate!.outflowCents).toBe(122_000 + 10_000);
    expect(all.rows[1]!.actual!.outflowCents).toBe(122_000);
  });
});
