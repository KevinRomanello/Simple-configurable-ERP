import { arrivalOf, type Arrival } from "./arrival";
import { lineAmounts, type LineAmounts } from "./line";
import type { Figures, FundInput, Snapshot } from "./snapshot";
import type { Phase } from "./types";
import { vatDeadline } from "./vat";

/** One line, one phase, with everything the views need already worked out. */
export interface PhaseCalc {
  /** What was typed in (null when the phase has no data yet): an editing screen starts from it. */
  figures: Figures | null;
  amounts: LineAmounts;
  fundId: number | null;
  fundName: string | null;
  fundKind: FundInput["kind"] | null;
  supplierId: number | null;
  supplierName: string | null;
  purchaseDate: string | null;
  arrivalDate: string | null;
  /** The VAT the team pays out of its own cash for this line (0 when someone else pays it). */
  teamVatCents: number;
  /** When that VAT falls due; needs a purchase date. */
  vatDueDate: string | null;
}

export interface CalcLine {
  id: number;
  position: number;
  item: string;
  category: string | null;
  priority: string | null;
  note: string | null;
  version: number;
  projectId: number;
  projectName: string;
  areaId: number;
  areaCode: string;
  areaName: string;
  estimate: PhaseCalc;
  actual: PhaseCalc;
  /** Bought versus arrived: the state of the purchase (see arrival.ts). */
  arrival: Arrival;
}

/**
 * Works out every line of the snapshot, ordered by area, project and position.
 * This is the shared first step of nearly every view.
 */
export function computeLines(snapshot: Snapshot): CalcLine[] {
  const { settings, vatRules } = snapshot.lookups;
  const areas = new Map(snapshot.areas.map((a) => [a.id, a]));
  const projects = new Map(snapshot.projects.map((p) => [p.id, p]));
  const funds = new Map(snapshot.funds.map((f) => [f.id, f]));
  const suppliers = new Map(snapshot.suppliers.map((s) => [s.id, s]));
  const received = new Map(snapshot.receipts.map((r) => [r.lineId, r.quantityMilli]));

  function phaseCalc(phase: Phase, figures: Figures | null): PhaseCalc {
    const amounts = lineAmounts(figures, settings);
    const fund = figures?.fundId != null ? funds.get(figures.fundId) : undefined;
    const supplier = figures?.supplierId != null ? suppliers.get(figures.supplierId) : undefined;
    const purchaseDate = figures?.purchaseDate ?? null;

    // The team pays the VAT when the purchase comes from its own fund, or from a fund that does
    // not cover VAT (the "DOES IT PAY VAT?" box of the old sheet is unchecked).
    const teamPays = fund !== undefined && (fund.kind === "team" || !fund.paysVat[phase]);
    const teamVatCents = teamPays ? amounts.vatCents : 0;

    return {
      figures,
      amounts,
      fundId: fund?.id ?? null,
      fundName: fund?.name ?? null,
      fundKind: fund?.kind ?? null,
      supplierId: supplier?.id ?? null,
      supplierName: supplier?.name ?? null,
      purchaseDate,
      arrivalDate: figures?.arrivalDate ?? null,
      teamVatCents,
      vatDueDate: teamVatCents > 0 && purchaseDate ? vatDeadline(purchaseDate, vatRules) : null,
    };
  }

  const calculated = snapshot.lines.map((line) => {
    const project = projects.get(line.projectId);
    if (!project) throw new Error(`Line ${line.id} refers to missing project ${line.projectId}`);
    const area = areas.get(project.areaId);
    if (!area) throw new Error(`Project ${project.id} refers to missing area ${project.areaId}`);
    return {
      areaPosition: area.position,
      projectPosition: project.position,
      line: {
        id: line.id,
        position: line.position,
        item: line.item,
        category: line.category,
        priority: line.priority,
        note: line.note,
        version: line.version,
        projectId: project.id,
        projectName: project.name,
        areaId: area.id,
        areaCode: area.code,
        areaName: area.name,
        estimate: phaseCalc("estimate", line.figures.estimate),
        actual: phaseCalc("actual", line.figures.actual),
        arrival: arrivalOf(line.figures.actual?.quantityMilli ?? 0, received.get(line.id) ?? 0),
      } satisfies CalcLine,
    };
  });

  calculated.sort(
    (a, b) =>
      a.areaPosition - b.areaPosition ||
      a.projectPosition - b.projectPosition ||
      a.line.position - b.line.position ||
      a.line.id - b.line.id,
  );
  return calculated.map((entry) => entry.line);
}
