import {
  analysisByFund, analysisBySupplier, blocksOf, cashFlowByMonth, cashFlowSummary, computeLines, fundContractsByMonth,
  fundSummary, gantt, itemsView, linesOfYear, moneyIn, totals, totalsOfLines, undatedGross, vatReport, type CalcLine,
  type ItemsFilters, type Phase, type Snapshot,
} from "@erp/calc";
import { notFound } from "../../core/errors";
import { loadSnapshot } from "../../snapshot";
import { allSeasons, getCurrentSeason, getSeasonById } from "../seasons/seasons.service";

// Every view is the same two steps: read the snapshot, hand it to a pure function of the engine.
// Nothing is stored, so a view can never be out of date.

/** CASH FROM: the summary per fund and the monthly inflows of contracts. */
export async function getFundsSummary(phase: Phase) {
  const snapshot = await loadSnapshot();
  return { rows: fundSummary(snapshot, phase), monthly: fundContractsByMonth(snapshot, phase) };
}

/** CASH FLOW: both phases, with the BANK balance they start from. */
export async function getCashFlowView() {
  const snapshot = await loadSnapshot();
  const phase = (p: Phase) => ({ summary: cashFlowSummary(snapshot, p), monthly: cashFlowByMonth(snapshot, p) });
  return { bank: snapshot.bank, estimate: phase("estimate"), actual: phase("actual") };
}

/** EXPECTED GANTT / ACTUAL GANTT. */
export async function getGantt(phase: Phase) {
  return gantt(await loadSnapshot(), phase);
}

/** SEASON TOTAL: the TOTAL of a season (the one asked for, else the one of the menu) and what came in. */
export async function getTotals(seasonId?: number) {
  const snapshot = await loadSnapshot(seasonId === undefined ? await getCurrentSeason() : await getSeasonById(seasonId));
  return { ...totals(snapshot), moneyIn: moneyIn([snapshot]) };
}

/** Every season, each with its snapshot and its lines (the TOTAL of a year or of a car is made of them). */
async function everySeason() {
  const seasons = [];
  for (const season of await allSeasons()) {
    const snapshot = await loadSnapshot(season);
    seasons.push({ season, snapshot, lines: computeLines(snapshot) });
  }
  return seasons;
}

/** TOTAL of some lines: the areas, the blocks and the threshold are the same in every season. */
const totalsOfSeasons = (lines: CalcLine[], any: Snapshot) =>
  totalsOfLines(lines, any.areas, blocksOf(any), any.lookups.settings.varianceThreshold);

/** YEAR TOTAL: the phases of every season with a purchase date in `year`, and what came in during it. */
export async function getYearTotals(year: number) {
  const seasons = await everySeason();
  const lines = seasons.flatMap((s) => s.lines);
  const y = String(year);
  return {
    ...totalsOfSeasons(linesOfYear(lines, y), seasons[0]!.snapshot),
    moneyIn: moneyIn(seasons.map((s) => s.snapshot), y),
    undated: undatedGross(lines),
  };
}

/**
 * CAR TOTAL: the lines of every season bought for `car` (the car of their season, or the one chosen
 * on the line); seasons with the same car (any case) are one. Money has no car: nothing came in.
 */
export async function getCarTotals(car: string) {
  const seasons = await everySeason();
  const carOf = new Map(seasons.map((s) => [s.season.id, s.season.car.toLowerCase()]));
  const lines = seasons.flatMap((s) => s.lines.filter((l) => carOf.get(l.carSeasonId ?? s.season.id) === car.toLowerCase()));
  return { ...totalsOfSeasons(lines, seasons[0]!.snapshot), moneyIn: null };
}

/** CASH FROM ANALYSES. */
export async function getFundAnalysis() {
  return analysisByFund(await loadSnapshot());
}

/** BOUGHT FROM ANALYSES. */
export async function getSupplierAnalysis() {
  return analysisBySupplier(await loadSnapshot());
}

/** CATEGORY ANALYSES. */
export async function getItemsView(filters: ItemsFilters) {
  return itemsView(await loadSnapshot(), filters);
}

/** The per-area VAT report. */
export async function getVatReport(areaCode: string) {
  const snapshot = await loadSnapshot();
  if (!snapshot.areas.some((a) => a.code === areaCode)) throw notFound(`Area "${areaCode}"`);
  return vatReport(snapshot, areaCode);
}
