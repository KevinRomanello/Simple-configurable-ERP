import { quarterFromIndex, quarterIndex, quarterOf } from "./dates";
import { computeLines } from "./lines";
import type { Snapshot } from "./snapshot";
import { deadlineForQuarter } from "./vat";

export interface VatReportProject {
  id: number;
  name: string;
  /** VAT due on each date of `deadlines`, same order. */
  estimateCents: number[];
  actualCents: number[];
}

export interface VatReport {
  deadlines: string[];
  projects: VatReportProject[];
}

/**
 * The per-area VAT report: for every project, how much VAT the team has to pay on each quarterly
 * deadline. The deadlines span the default horizon and widen to cover every purchase date
 * (estimate or actual) of the area.
 */
export function vatReport(snapshot: Snapshot, areaCode: string): VatReport {
  const area = snapshot.areas.find((a) => a.code === areaCode);
  if (!area) throw new Error(`Unknown area: ${areaCode}`);
  const { vatRules, settings } = snapshot.lookups;

  const lines = computeLines(snapshot).filter((l) => l.areaId === area.id);

  let first = quarterIndex(settings.vatReportHorizon.from);
  let last = quarterIndex(settings.vatReportHorizon.to);
  for (const line of lines) {
    for (const date of [line.estimate.purchaseDate, line.actual.purchaseDate]) {
      if (!date) continue;
      const index = quarterIndex(quarterOf(date));
      first = Math.min(first, index);
      last = Math.max(last, index);
    }
  }

  const deadlines: string[] = [];
  for (let index = first; index <= last; index++) {
    deadlines.push(deadlineForQuarter(quarterFromIndex(index), vatRules));
  }

  const projects = snapshot.projects
    .filter((p) => p.areaId === area.id)
    .sort((a, b) => a.position - b.position)
    .map((project) => {
      const projectLines = lines.filter((l) => l.projectId === project.id);
      const sumOn = (phase: "estimate" | "actual") =>
        deadlines.map((deadline) =>
          projectLines
            .filter((l) => l[phase].vatDueDate === deadline)
            .reduce((sum, l) => sum + l[phase].teamVatCents, 0),
        );
      return {
        id: project.id,
        name: project.name,
        estimateCents: sumOn("estimate"),
        actualCents: sumOn("actual"),
      };
    });

  return { deadlines, projects };
}

