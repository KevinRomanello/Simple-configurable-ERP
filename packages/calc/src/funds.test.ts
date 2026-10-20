import { describe, expect, it } from "vitest";
import { figures, line, snapshot } from "./fixtures";
import { fundContractsByMonth, fundSummary, inflowsByMonth } from "./funds";
import type { FundInput } from "./snapshot";

const sponsor = (paysVat: boolean): FundInput => ({
  id: 2,
  name: "Sponsor A",
  kind: "external",
  paysVat: { estimate: paysVat, actual: paysVat },
});

// docs/regole-script-attuale.md, section 17: contract 10 000.00; the fund's lines have a total
// outflow of 6 000.00, of which 800.00 is VAT.
function withSponsor(paysVat: boolean) {
  return snapshot({
    projects: [{ id: 1, areaId: 1, name: "P", ownerName: null, position: 1 }],
    funds: [
      { id: 1, name: "Team's fund", kind: "team", paysVat: { estimate: false, actual: false } },
      sponsor(paysVat),
    ],
    contracts: [{ id: 1, fundId: 2, phase: "estimate", amountCents: 1_000_000, inflowDate: null }],
    lines: [
      line(1, 1, figures(1, 4000, { fundId: 2, vatRate: 20 })), // outflow 4 800.00, VAT 800.00
      line(2, 1, figures(1, 1200, { fundId: 2, vatRate: 0 })), // outflow 1 200.00
      line(3, 1, figures(1, 999, { fundId: 1 })), // paid by the team: not this fund's business
    ],
  });
}

describe("fundSummary", () => {
  it("leaves VAT out of the balance of a fund that does not pay it", () => {
    const [row] = fundSummary(withSponsor(false), "estimate");
    expect(row).toMatchObject({
      name: "Sponsor A",
      totalContractCents: 1_000_000,
      outflowCents: 600_000,
      vatCents: 80_000,
      paysVat: false,
      leftCents: 480_000,
    });
  });

  it("charges VAT to a fund that pays it", () => {
    const [row] = fundSummary(withSponsor(true), "estimate");
    expect(row!.leftCents).toBe(400_000);
  });

  it("goes negative when the fund is overspent", () => {
    const s = withSponsor(true);
    s.contracts[0]!.amountCents = 100_000;
    expect(fundSummary(s, "estimate")[0]!.leftCents).toBe(-500_000);
  });

  it("lists only external funds that have a contract in the phase", () => {
    expect(fundSummary(withSponsor(true), "actual")).toEqual([]);
  });

  it("sums several contracts of the same fund", () => {
    const s = withSponsor(true);
    s.contracts.push({ id: 2, fundId: 2, phase: "estimate", amountCents: 50_000, inflowDate: "2026-02-01" });
    expect(fundSummary(s, "estimate")[0]!.totalContractCents).toBe(1_050_000);
  });
});

describe("inflowsByMonth", () => {
  const rows = [
    { name: "B", amountCents: 100, date: "2026-03-10" },
    { name: "a", amountCents: 200, date: "2026-03-25" },
    { name: "C", amountCents: 50, date: "2026-06-01" },
    { name: "D", amountCents: 0, date: "2026-07-01" },
    { name: "E", amountCents: 70, date: null },
  ];

  it("covers every month between the first and the last dated row", () => {
    expect(inflowsByMonth(rows).map((m) => m.month)).toEqual([
      "2026-03", "2026-04", "2026-05", "2026-06", "2026-07",
    ]);
  });

  it("sums each month and lists the payers, ignoring zero amounts and undated rows", () => {
    const [march, april, , june, july] = inflowsByMonth(rows);
    expect(march).toEqual({ month: "2026-03", totalCents: 300, names: ["a", "B"] });
    expect(april).toEqual({ month: "2026-04", totalCents: 0, names: [] });
    expect(june).toEqual({ month: "2026-06", totalCents: 50, names: ["C"] });
    expect(july).toEqual({ month: "2026-07", totalCents: 0, names: [] });
  });

  it("is empty without dated rows", () => {
    expect(inflowsByMonth([{ name: "x", amountCents: 1, date: null }])).toEqual([]);
  });
});

describe("fundContractsByMonth", () => {
  it("names the funds behind each month", () => {
    const s = withSponsor(true);
    s.contracts[0]!.inflowDate = "2026-01-09";
    expect(fundContractsByMonth(s, "estimate")).toEqual([
      { month: "2026-01", totalCents: 1_000_000, names: ["Sponsor A"] },
    ]);
  });
});
