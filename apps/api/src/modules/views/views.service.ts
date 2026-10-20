import {
  analysisByFund, analysisBySupplier, cashFlowByMonth, cashFlowSummary, fundContractsByMonth,
  fundSummary, gantt, itemsView, totals, vatReport, type ItemsFilters, type Phase,
} from "@erp/calc";
import { notFound } from "../../core/errors";
import { loadSnapshot } from "../../snapshot";

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

export async function getTotals() {
  return totals(await loadSnapshot());
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
