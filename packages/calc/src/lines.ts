import { arrivalOf, type Arrival } from "./arrival";
import type { LineAmounts } from "./line";
import { settleLine, type FundBalances, type FundShare } from "./settle";
import type { Figures, FundInput, Snapshot } from "./snapshot";
import type { Phase } from "./types";
import { vatDeadline } from "./vat";

/** One line, one phase, with everything the views need already worked out. */
export interface PhaseCalc {
  /** What was typed in (null when the phase has no data yet): an editing screen starts from it. */
  figures: Figures | null;
  amounts: LineAmounts;
  /** The funds that pay the line, in order, each with its part (see settle.ts). */
  shares: FundShare[];
  /** Their names for display, "A + B"; null without funds. */
  fundName: string | null;
  /** How much the funds of the line could not cover, in cents: above zero, the line is flagged. */
  shortCents: number;
  /** The net purchases paid from the team fund (VAT excluded). */
  teamFundCents: number;
  /** How much of it the payments of the register linked to this line have paid (ACTUAL only). */
  paidCents: number;
  /** What is still to leave the team fund: `teamFundCents` less what is paid. */
  teamFundDueCents: number;
  /** When it leaves: the purchase date, or the day after the BANK when that has passed and the line is partly paid. */
  cashDate: string | null;
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
  /** Bought for the car of another season (its id); null = the car of its own season. */
  carSeasonId: number | null;
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
 *
 * The funds are drawn down in the order of the sheet: a fund that runs out in one line has
 * nothing left for the lines below it.
 */
export function computeLines(snapshot: Snapshot): CalcLine[] {
  const { settings, vatRules } = snapshot.lookups;
  const areas = new Map(snapshot.areas.map((a) => [a.id, a]));
  const projects = new Map(snapshot.projects.map((p) => [p.id, p]));
  const funds = new Map(snapshot.funds.map((f) => [f.id, f]));
  const suppliers = new Map(snapshot.suppliers.map((s) => [s.id, s]));
  const received = new Map(snapshot.receipts.map((r) => [r.lineId, r.quantityMilli]));
  const paid = new Map((snapshot.payments ?? []).map((p) => [p.lineId, p.cents]));

  // What each fund can still pay in a phase: its contracts (a gift has none and is never short).
  const balances: Record<Phase, FundBalances> = { estimate: new Map(), actual: new Map() };
  for (const contract of snapshot.contracts) {
    const balance = balances[contract.phase];
    balance.set(contract.fundId, (balance.get(contract.fundId) ?? 0) + contract.amountCents);
  }

  function phaseCalc(phase: Phase, figures: Figures | null, lineId: number): PhaseCalc {
    const chosen = (figures?.fundIds ?? []).map((id) => funds.get(id)).filter((f): f is FundInput => f !== undefined);
    const settled = settleLine(figures, chosen, balances[phase], settings);
    const supplier = figures?.supplierId != null ? suppliers.get(figures.supplierId) : undefined;
    const purchaseDate = figures?.purchaseDate ?? null;
    // a line with payments counts only what is still to pay; one without keeps the rule of the purchase date
    const paidCents = phase === "actual" ? (paid.get(lineId) ?? 0) : 0;
    const teamFundDueCents = Math.max(0, settled.teamFundCents - paidCents);
    const late = paidCents > 0 && teamFundDueCents > 0 && snapshot.lateFrom !== undefined && purchaseDate !== null && purchaseDate < snapshot.lateFrom;

    return {
      figures,
      amounts: settled.amounts,
      shares: settled.shares,
      fundName: chosen.length > 0 ? chosen.map((f) => f.name).join(" + ") : null,
      shortCents: settled.shares.reduce((sum, s) => sum + s.shortCents, 0),
      teamFundCents: settled.teamFundCents,
      paidCents,
      teamFundDueCents,
      cashDate: late ? snapshot.lateFrom! : purchaseDate,
      supplierId: supplier?.id ?? null,
      supplierName: supplier?.name ?? null,
      purchaseDate,
      arrivalDate: figures?.arrivalDate ?? null,
      teamVatCents: settled.teamVatCents,
      vatDueDate: settled.teamVatCents > 0 && purchaseDate ? vatDeadline(purchaseDate, vatRules) : null,
    };
  }

  const ordered = snapshot.lines
    .map((line) => {
      const project = projects.get(line.projectId);
      if (!project) throw new Error(`Line ${line.id} refers to missing project ${line.projectId}`);
      const area = areas.get(project.areaId);
      if (!area) throw new Error(`Project ${project.id} refers to missing area ${project.areaId}`);
      return { line, project, area };
    })
    .sort(
      (a, b) =>
        a.area.position - b.area.position ||
        a.project.position - b.project.position ||
        a.line.position - b.line.position ||
        a.line.id - b.line.id,
    );

  return ordered.map(({ line, project, area }): CalcLine => ({
    id: line.id,
    position: line.position,
    item: line.item,
    category: line.category,
    priority: line.priority,
    note: line.note,
    version: line.version,
    carSeasonId: line.carSeasonId,
    projectId: project.id,
    projectName: project.name,
    areaId: area.id,
    areaCode: area.code,
    areaName: area.name,
    estimate: phaseCalc("estimate", line.figures.estimate, line.id),
    actual: phaseCalc("actual", line.figures.actual, line.id),
    arrival: arrivalOf(line.figures.actual?.quantityMilli ?? 0, received.get(line.id) ?? 0),
  }));
}
