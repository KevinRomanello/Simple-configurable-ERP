import { sumAmounts, type Amounts } from "./line";
import { computeLines, type CalcLine } from "./lines";
import type { Snapshot } from "./snapshot";

/**
 * The sums of a phase: the five amounts and, apart, the VAT that the team pays out of its own money
 * (the lines paid with the team's fund and the counter-invoice of goods from a sponsor). The VAT
 * of the other lines is covered by a fund: it is in `vatCents`, but it is not the team's cost.
 */
export interface PhaseSum extends Amounts {
  teamVatCents: number;
}

export interface PhaseTotals {
  estimate: PhaseSum;
  actual: PhaseSum;
}

function sumPhase(list: PhaseSum[]): PhaseSum {
  return { ...sumAmounts(list), teamVatCents: list.reduce((sum, a) => sum + a.teamVatCents, 0) };
}

export interface SheetProject {
  id: number;
  name: string;
  ownerName: string | null;
  lines: CalcLine[];
  /** The yellow row of the old sheet. */
  subtotal: PhaseTotals;
}

export interface AreaSheet {
  area: { id: number; code: string; name: string };
  projects: SheetProject[];
  /** The TOTAL row of the old sheet. */
  total: PhaseTotals;
}

export function totalsOf(lines: CalcLine[]): PhaseTotals {
  const sums = (phase: "estimate" | "actual") =>
    sumPhase(lines.map((l) => ({ ...l[phase].amounts, teamVatCents: l[phase].teamVatCents })));
  return { estimate: sums("estimate"), actual: sums("actual") };
}

/** One area as the old area sheets showed it: projects, their lines, subtotals and the total. */
export function areaSheet(snapshot: Snapshot, areaCode: string): AreaSheet {
  const area = snapshot.areas.find((a) => a.code === areaCode);
  if (!area) throw new Error(`Unknown area: ${areaCode}`);

  const lines = computeLines(snapshot).filter((l) => l.areaId === area.id);
  const projects = snapshot.projects
    .filter((p) => p.areaId === area.id)
    .sort((a, b) => a.position - b.position || a.id - b.id) // same position (a race): oldest first
    .map((p) => {
      const projectLines = lines.filter((l) => l.projectId === p.id);
      return {
        id: p.id,
        name: p.name,
        ownerName: p.ownerName,
        lines: projectLines,
        subtotal: totalsOf(projectLines),
      };
    });

  const total: PhaseTotals = {
    estimate: sumPhase(projects.map((p) => p.subtotal.estimate)),
    actual: sumPhase(projects.map((p) => p.subtotal.actual)),
  };

  return { area: { id: area.id, code: area.code, name: area.name }, projects, total };
}
