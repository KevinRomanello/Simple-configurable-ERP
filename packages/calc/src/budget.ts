import { sumAmounts, type Amounts } from "./line";
import { computeLines, type CalcLine } from "./lines";
import type { Snapshot } from "./snapshot";

export interface PhaseTotals {
  estimate: Amounts;
  actual: Amounts;
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
  return {
    estimate: sumAmounts(lines.map((l) => l.estimate.amounts)),
    actual: sumAmounts(lines.map((l) => l.actual.amounts)),
  };
}

/** One area as the old area sheets showed it: projects, their lines, subtotals and the total. */
export function areaSheet(snapshot: Snapshot, areaCode: string): AreaSheet {
  const area = snapshot.areas.find((a) => a.code === areaCode);
  if (!area) throw new Error(`Unknown area: ${areaCode}`);

  const lines = computeLines(snapshot).filter((l) => l.areaId === area.id);
  const projects = snapshot.projects
    .filter((p) => p.areaId === area.id)
    .sort((a, b) => a.position - b.position)
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
    estimate: sumAmounts(projects.map((p) => p.subtotal.estimate)),
    actual: sumAmounts(projects.map((p) => p.subtotal.actual)),
  };

  return { area: { id: area.id, code: area.code, name: area.name }, projects, total };
}
