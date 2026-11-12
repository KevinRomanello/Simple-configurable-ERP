import { arrivalOf, type Arrival } from "./arrival";
import { roundDiv } from "./money";
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
  /**
   * The price of one unit both ways, in ten-thousandths of a euro: the one that was typed is exact, the other
   * is worked out from the amounts of the line (so it can be a hair off when the quantity is large).
   */
  unitPriceE4: { net: number; gross: number };
  /** The funds that pay the line, in order, each with its part (see settle.ts). */
  shares: FundShare[];
  /** Their names for display, "A + B"; null without funds. */
  fundName: string | null;
  /** How much the funds of the line could not cover, in cents: above zero, the line is flagged. */
  shortCents: number;
  /** The net purchases paid from the team fund (VAT excluded). */
  teamFundCents: number;
  /**
   * How much the payments of the register linked to this line have paid (ACTUAL only). A payment covers what the
   * team pays for the line: the net first, then the VAT (docs/registro-di-cassa.md, section 5.3).
   */
  paidCents: number;
  /** What is left to pay of the net and of the VAT, whatever the BANK is: this is what the page TO PAY lists. */
  unpaidFundCents: number;
  unpaidVatCents: number;
  /**
   * What the forecast counts as still to leave the team fund (VAT excluded): `unpaidFundCents` when the BANK comes
   * from the register (the payments are in it), the whole `teamFundCents` otherwise.
   */
  teamFundDueCents: number;
  /** The same for the VAT the team pays: what is left, counted on its deadline. */
  teamVatDueCents: number;
  /** When the net leaves: the purchase date, or the day after the BANK when that has passed and something of the line is paid. */
  cashDate: string | null;
  /** When the VAT leaves: its deadline, or the day after the BANK when that has passed and something of the line is paid. */
  vatCashDate: string | null;
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
    // a payment covers the net the team pays first and then the VAT: the gross at once, or the net now and the VAT later
    const paidCents = phase === "actual" ? (paid.get(lineId) ?? 0) : 0;
    const unpaidFundCents = settled.teamFundCents - Math.min(paidCents, settled.teamFundCents);
    const unpaidVatCents = settled.teamVatCents - Math.min(Math.max(0, paidCents - settled.teamFundCents), settled.teamVatCents);
    // the forecast counts only what is still to pay when the BANK is the register's (the payments are in it);
    // a line without payments keeps the rule of the purchase date and of the VAT deadline
    const inBank = snapshot.lateFrom !== undefined;
    const teamFundDueCents = inBank ? unpaidFundCents : settled.teamFundCents;
    const teamVatDueCents = inBank ? unpaidVatCents : settled.teamVatCents;
    const vatDueDate = settled.teamVatCents > 0 && purchaseDate ? vatDeadline(purchaseDate, vatRules) : null;
    // something paid and something left, and the day has passed: it has not left yet, so it counts from the day after the BANK
    const late = (due: number, date: string | null) => inBank && paidCents > 0 && due > 0 && date !== null && date < snapshot.lateFrom!;

    const quantity = figures?.quantityMilli ?? 0;
    // cents x 100 000 / thousandths = ten-thousandths of a euro per unit
    const perUnit = (cents: number) => (quantity > 0 ? roundDiv((cents * 100_000), quantity) : 0);
    const typedGross = figures?.unitGrossE4 != null;
    const unitPriceE4 = {
      net: typedGross ? perUnit(settled.amounts.netCents) : (figures?.unitCostE4 ?? 0),
      gross: typedGross ? figures!.unitGrossE4! : perUnit(settled.amounts.grossCents),
    };

    return {
      figures,
      amounts: settled.amounts,
      unitPriceE4,
      shares: settled.shares,
      fundName: chosen.length > 0 ? chosen.map((f) => f.name).join(" + ") : null,
      shortCents: settled.shares.reduce((sum, s) => sum + s.shortCents, 0),
      teamFundCents: settled.teamFundCents,
      paidCents,
      unpaidFundCents,
      unpaidVatCents,
      teamFundDueCents,
      teamVatDueCents,
      cashDate: late(teamFundDueCents, purchaseDate) ? snapshot.lateFrom! : purchaseDate,
      vatCashDate: late(teamVatDueCents, vatDueDate) ? snapshot.lateFrom! : vatDueDate,
      supplierId: supplier?.id ?? null,
      supplierName: supplier?.name ?? null,
      purchaseDate,
      arrivalDate: figures?.arrivalDate ?? null,
      teamVatCents: settled.teamVatCents,
      vatDueDate,
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
