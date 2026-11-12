import { describe, expect, it } from "vitest";
import { cashFlowSummary } from "./cashflow";
import { snapshot, line, figures } from "./fixtures";
import { computeLines } from "./lines";
import { moneyIn } from "./moneyIn";
import { OTHER_SECTION, outsideBudget, type OutsideEntry } from "./outside";
import type { AreaInput, Snapshot } from "./snapshot";
import { sectionsOfVoci, voceKey, type StatementSpec } from "./statement";
import { totals } from "./totals";

const AREA: AreaInput = { id: 7, code: "administration", name: "ADMINISTRATION", position: 7, derived: true };

// a small statement: two sections of costs, and the income of a fee that no section holds
const LAYOUT: StatementSpec[] = [
  { row: 1, kind: "voce", label: "1. FEES", bold: true, paypal: true },
  { row: 2, kind: "sum", label: "8. TAXES", of: [3, 4], total: false },
  { row: 3, kind: "voce", label: "8.1 Stamp", bold: false, paypal: true },
  { row: 4, kind: "voce", label: "8.2 Duty", bold: false, paypal: true },
  { row: 5, kind: "sum", label: "2. SERVICES", of: [6], total: false },
  { row: 6, kind: "voce", label: "2.1 Insurance", bold: false, paypal: true },
  { row: 7, kind: "sum", label: "TOTAL", of: [2, 5], total: true },
];
const SECTIONS = sectionsOfVoci(LAYOUT);

const move = (on: string, voce: string, cents: number): OutsideEntry => ({ on, voce, cents });

describe("sectionsOfVoci", () => {
  it("puts each Voce in the nearest section above it, a Voce no section adds up in its own", () => {
    expect([...SECTIONS]).toEqual([
      [voceKey("1. FEES"), "1. FEES"],
      [voceKey("8.1 Stamp"), "8. TAXES"],
      [voceKey("8.2 Duty"), "8. TAXES"],
      [voceKey("2.1 Insurance"), "2. SERVICES"],
    ]);
  });
});

describe("outsideBudget", () => {
  it("makes one ACTUAL line for each Voce and month, in the project of its section, with the cost as a positive amount", () => {
    const { projects, lines } = outsideBudget(
      [move("2026-03-02", "8.1 Stamp", -1_600), move("2026-03-20", "8.1 Stamp", -400), move("2026-04-01", "8.1 Stamp", -1_600), move("2026-03-05", "2.1 Insurance", -50_000)],
      SECTIONS, AREA, "Administration",
    );
    // the sections in the order of the statement (the fees section has no cost, so it makes no project)
    expect(projects.map((p) => [p.name, p.position, p.areaId])).toEqual([["8. TAXES", 2, 7], ["2. SERVICES", 3, 7]]);
    expect(lines.map((l) => [l.item, l.figures.actual!.unitCostE4 / 100, l.figures.actual!.purchaseDate])).toEqual([
      ["8.1 Stamp - 2026-03", 2_000, "2026-03-20"],
      ["8.1 Stamp - 2026-04", 1_600, "2026-04-01"],
      ["2.1 Insurance - 2026-03", 50_000, "2026-03-05"],
    ]);
    expect(lines[0]).toMatchObject({ category: "Administration", note: "2 movements in the register", version: 0 });
    expect(lines.every((l) => l.id < 0 && l.figures.estimate === null)).toBe(true);
    expect(projects.every((p) => p.id < 0)).toBe(true);
    expect(new Set(lines.map((l) => l.id)).size).toBe(3);
  });

  it("subtracts what came back from what was spent, and leaves a month that nets to zero out", () => {
    const { lines } = outsideBudget(
      [move("2026-03-02", "8.1 Stamp", -1_000), move("2026-03-09", "8.1 Stamp", 300), move("2026-03-10", "8.2 Duty", -500), move("2026-03-11", "8.2 Duty", 500)],
      SECTIONS, AREA, "Administration",
    );
    expect(lines.map((l) => [l.item, l.figures.actual!.unitCostE4 / 100])).toEqual([["8.1 Stamp - 2026-03", 700]]);
  });

  it("makes money in of a month where more came in than went out, with the day of its last movement", () => {
    const { lines, income } = outsideBudget(
      [move("2026-02-03", "1. FEES", 2_500), move("2026-02-20", "1. FEES", 1_500), move("2026-03-03", "1. FEES", 1_000), move("2026-03-04", "1. FEES", -100)],
      SECTIONS, AREA, "Administration",
    );
    expect(lines).toEqual([]);
    expect(income).toEqual([{ voce: "1. FEES", on: "2026-02-20", cents: 4_000 }, { voce: "1. FEES", on: "2026-03-04", cents: 900 }]);
  });

  it("finds the Voce whatever the capitals, and puts a Voce the statement does not have in a last project of its own", () => {
    const { projects, lines } = outsideBudget([move("2026-03-02", "8.1 STAMP", -100), move("2026-03-02", "9.5 Invoice", -700)], SECTIONS, AREA, "Administration");
    expect(projects.map((p) => p.name)).toEqual(["8. TAXES", OTHER_SECTION]);
    expect(lines.map((l) => l.projectId)).toEqual(projects.map((p) => p.id));
  });

  it("is empty when nothing counts outside the budget", () => {
    expect(outsideBudget([], SECTIONS, AREA, "Administration")).toEqual({ projects: [], lines: [], receipts: [], income: [] });
  });
});

/** A snapshot with the derived area added to the real six, and a budget line of an ordinary area. */
function withOutside(entries: OutsideEntry[], over: Partial<Snapshot> = {}): Snapshot {
  const outside = outsideBudget(entries, SECTIONS, AREA, "Administration");
  const base = snapshot({ projects: [{ id: 1, areaId: 1, name: "Chassis", ownerName: null, position: 1 }], lines: [line(1, 1, null, figures(1, 1_000, { sponsorType: "none", vatRate: 22, fundIds: [1], purchaseDate: "2026-10-01" }), { category: "Asset" })], ...over });
  return {
    ...base,
    areas: [...base.areas, AREA],
    projects: [...base.projects, ...outside.projects],
    lines: [...base.lines, ...outside.lines],
    receipts: [...base.receipts, ...outside.receipts],
    registerIncome: outside.income,
  };
}

describe("the derived area in the engine", () => {
  const entries = [move("2026-03-02", "8.1 Stamp", -1_600), move("2026-03-05", "2.1 Insurance", -50_000), move("2026-03-09", "1. FEES", 2_500)];

  it("is an area like the others: its lines are ACTUAL only, paid by no fund, complete, and arrived", () => {
    const lines = computeLines(withOutside(entries)).filter((l) => l.areaId === AREA.id);
    expect(lines.map((l) => l.item)).toEqual(["8.1 Stamp - 2026-03", "2.1 Insurance - 2026-03"]);
    const insurance = lines[1];
    expect(insurance!.actual.amounts).toEqual({ netCents: 50_000, vatCents: 0, grossCents: 50_000, sponsorCents: 0, outflowCents: 50_000, complete: true });
    expect(insurance!.estimate.amounts.outflowCents).toBe(0);
    expect(insurance!.actual.teamFundCents).toBe(0);
    expect(insurance!.actual.teamVatCents).toBe(0);
    expect(insurance!.arrival.status).toBe("received");
    expect(insurance!.category).toBe("Administration");
  });

  it("counts in TOTAL in its own row, in ALL and in the block of its category, with no warning of a variance", () => {
    const { blocks } = totals(withOutside(entries));
    const row = (block: string) => blocks.find((b) => b.block === block)!.rows.find((r) => r.areaCode === "administration")!;
    expect(row("ALL")).toMatchObject({ actualOutflowCents: 51_600, estimateOutflowCents: 0, outflowVariance: null, outflowOutOfRange: false });
    expect(row("ALL").projects.map((p) => p.name)).toEqual(["8. TAXES", "2. SERVICES"]);
    expect(row("Administration").actualOutflowCents).toBe(51_600);
    expect(row("Asset").actualOutflowCents).toBe(0);
    // the other areas keep their own: the derived rows are added, nothing else moves
    expect(blocks.find((b) => b.block === "ALL")!.rows.find((r) => r.areaCode === "mt-dmt")!.actualOutflowCents).toBe(1_220_00);
    expect(blocks.find((b) => b.block === "ALL")!.total.actualOutflowCents).toBe(51_600 + 1_220_00);
  });

  it("does not touch CASH FLOW: the team fund pays none of it", () => {
    const without = withOutside([], { bank: { amountCents: 100_000, asOfDate: "2026-02-01" } });
    const with_ = withOutside(entries, { bank: { amountCents: 100_000, asOfDate: "2026-02-01" } });
    expect(cashFlowSummary(with_, "actual")).toEqual(cashFlowSummary(without, "actual"));
  });
});

describe("money in outside the budget", () => {
  const entries = [move("2026-03-09", "1. FEES", 2_500), move("2026-05-10", "1. FEES", 1_000), move("2027-01-10", "1. FEES", 700)];

  it("shows by Voce in a calendar year, all of it dated in that year", () => {
    const money = moneyIn([withOutside(entries)], "2026");
    expect(money.rows).toEqual([{ kind: "register", label: "1. FEES", asOf: null, estimateCents: 0, actualCents: 3_500 }]);
    expect(money.total).toEqual({ estimate: 0, actual: 3_500 });
    expect(moneyIn([withOutside(entries)], "2027").total.actual).toBe(700);
  });

  it("in a season counts only what came after the BANK day, as an inflow does: the rest is in the BANK", () => {
    const money = moneyIn([withOutside(entries, { bank: { amountCents: 9_000, asOfDate: "2026-04-01" } })]);
    expect(money.rows.map((r) => [r.kind, r.actualCents])).toEqual([["bank", 9_000], ["register", 1_700]]);
  });
});
