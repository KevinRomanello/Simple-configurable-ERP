import { describe, expect, it } from "vitest";
import { figures, line, snapshot, sponsorFund, teamFund } from "./fixtures";
import { computeLines } from "./lines";
import type { FundInput } from "./snapshot";

const sponsor: FundInput = sponsorFund(2, { name: "Sponsor A" });

// One project in the first area, one line per test; the fund decides who pays the VAT.
function build(estimateFigures: ReturnType<typeof figures>, actualFigures = null as ReturnType<typeof figures> | null) {
  return snapshot({
    projects: [{ id: 1, areaId: 1, name: "P", ownerName: null, position: 1 }],
    funds: [
      teamFund,
      sponsor,
    ],
    suppliers: [{ id: 1, name: "Amazon" }],
    lines: [line(1, 1, estimateFigures, actualFigures)],
  });
}

describe("computeLines: VAT paid by the team", () => {
  it("the team pays the VAT of purchases from its own fund, due on the quarterly deadline", () => {
    const [l] = computeLines(build(figures(10, 100, { fundIds: [1], purchaseDate: "2026-11-10" })));
    expect(l!.estimate.teamVatCents).toBe(22_000);
    expect(l!.estimate.vatDueDate).toBe("2027-02-16");
    expect(l!.estimate.fundName).toBe("Team's fund");
  });

  it("a fund that covers VAT leaves nothing to the team", () => {
    const [l] = computeLines(build(figures(10, 100, { fundIds: [2], purchaseDate: "2026-11-10" })));
    expect(l!.estimate.teamVatCents).toBe(0);
    expect(l!.estimate.vatDueDate).toBeNull();
  });

  it("the box of the fund decides in both phases", () => {
    const [l] = computeLines(
      build(
        figures(10, 100, { fundIds: [2], purchaseDate: "2026-11-10" }),
        figures(10, 100, { fundIds: [2], purchaseDate: "2026-11-10" }),
      ),
    );
    expect(l!.estimate.teamVatCents).toBe(0);
    expect(l!.actual.teamVatCents).toBe(0);
  });

  it("a line without fund has no team VAT", () => {
    const [l] = computeLines(build(figures(10, 100, { purchaseDate: "2026-11-10" })));
    expect(l!.estimate.teamVatCents).toBe(0);
  });

  it("team VAT without a purchase date has no due date yet", () => {
    const [l] = computeLines(build(figures(10, 100, { fundIds: [1] })));
    expect(l!.estimate.teamVatCents).toBe(22_000);
    expect(l!.estimate.vatDueDate).toBeNull();
  });

  it("no VAT, no team VAT", () => {
    const [l] = computeLines(build(figures(10, 100, { fundIds: [1], vatRate: 0 })));
    expect(l!.estimate.teamVatCents).toBe(0);
  });
});

describe("computeLines: shape", () => {
  it("resolves supplier names and treats a missing phase as zeros", () => {
    const [l] = computeLines(build(figures(1, 50, { supplierId: 1 })));
    expect(l!.estimate.supplierName).toBe("Amazon");
    expect(l!.actual.amounts.outflowCents).toBe(0);
    expect(l!.areaName).toBe("MT + DMT");
  });

  it("keeps the typed figures next to the results, so a screen can edit them", () => {
    const [l] = computeLines(build(figures(2.5, 10, { vatRate: 11, sponsorType: "none" })));
    expect(l!.estimate.figures).toMatchObject({ quantityMilli: 2_500, unitCostE4: 100_000, vatRate: 11 });
    expect(l!.actual.figures).toBeNull();
  });

  it("orders by area, project and position, whatever the input order", () => {
    const s = snapshot({
      projects: [
        { id: 1, areaId: 2, name: "In SW", ownerName: null, position: 1 },
        { id: 2, areaId: 1, name: "B", ownerName: null, position: 2 },
        { id: 3, areaId: 1, name: "A", ownerName: null, position: 1 },
      ],
      lines: [line(1, 1, null), line(2, 2, null), line(3, 3, null)],
    });
    expect(computeLines(s).map((l) => l.projectName)).toEqual(["A", "B", "In SW"]);
  });

  it("fails loudly on a line whose project is missing", () => {
    expect(() => computeLines(snapshot({ lines: [line(1, 99, null)] }))).toThrow(/missing project/);
  });
});
