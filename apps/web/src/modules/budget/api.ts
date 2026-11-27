// The calls of budget to the API (split from api/client.ts in G7: docs/moduli-architettura.md, §7.1).
import { del, get, patch, post, put } from "../../core/api";
import type { Bank, Calculation, Fund, FundType, Inflow, NewContract, SponsorBody, Supplier, TotalsView } from "./types";
import type { Analysis, AreaSheet, CashFlowSummary, FundSummaryRow, Gantt, ItemsView, MonthlyInflow, Phase, VatReport } from "../../core/calcTypes";
import type { NewLineBody } from "./lineDraft";

/** What the budget grid sends when a cell changes (see docs/architettura.md, API). */
export interface FiguresPatch {
  quantity?: number | null;
  unitNetCost?: number | null;
  /** The price typed with the VAT in it; send this or `unitNetCost`, not both. */
  unitGrossCost?: number | null;
  sponsorType?: string | null;
  sponsorValue?: number | null;
  vatRate?: number | null;
  /** The funds that pay the line, in order; an empty list clears them. */
  fundIds?: number[];
  supplierId?: number | null;
  purchaseDate?: string | null;
  arrivalDate?: string | null;
}
export interface LinePatch {
  version: number;
  item?: string;
  /** What was bought, beside the item; null takes it away. */
  brand?: string | null;
  model?: string | null;
  category?: string | null;
  priority?: string | null;
  note?: string | null;
  /** The car of another season the line is bought for; null = the car of its own season. */
  carSeasonId?: number | null;
  figures?: Partial<Record<Phase, FiguresPatch>>;
}


export const budgetApi = {
  /** The switches of the calculation (the budget's; the answer has the span of the VAT report too). */
  calculation: () => get<Calculation>("/budget/lookups/settings"),
  updateCalculation: (body: Partial<Omit<Calculation, "bankCompare">> & { bankCompare?: Partial<Calculation["bankCompare"]> }) =>
    patch<void>("/budget/settings/calculation", body),
  priorities: () => get<string[]>("/budget/lookups/priorities"),
  /** The VAT rate that some kinds of sponsor cannot choose (goods: 0, goods against a counter-invoice: 11). */
  fixedSponsorRates: () => get<Partial<Record<FundType, number>>>("/budget/lookups/sponsor-rates"),
  sheet: (code: string) => get<AreaSheet>(`/budget/areas/${code}/sheet`),
  vatReport: (code: string) => get<VatReport>(`/budget/views/vat-report?area=${code}`),
  createProject: (body: { areaCode: string; name: string; ownerName?: string | null }) => post("/budget/projects", body),
  updateProject: (id: number, body: { name?: string; ownerName?: string | null }) => patch(`/budget/projects/${id}`, body),
  deleteProject: (id: number) => del(`/budget/projects/${id}`),
  createLine: (projectId: number, body: NewLineBody) => post(`/budget/projects/${projectId}/lines`, body),
  updateLine: (id: number, body: LinePatch) => patch(`/budget/lines/${id}`, body),
  deleteLine: (id: number) => del(`/budget/lines/${id}`),
  // funds, suppliers, cash flow
  funds: (phase?: Phase) => get<Fund[]>(`/budget/funds${phase ? `?phase=${phase}` : ""}`),
  createFund: (body: Partial<SponsorBody> & { name: string; contracts?: NewContract[] }) => post<Fund>("/budget/funds", body),
  updateFund: (id: number, body: Partial<SponsorBody>) => patch<Fund>(`/budget/funds/${id}`, body),
  deleteFund: (id: number) => del(`/budget/funds/${id}`),
  setContract: (fundId: number, phase: Phase, body: { amount: string; inflowDate: string | null }) =>
    put(`/budget/funds/${fundId}/contracts/${phase}`, body),
  clearContract: (fundId: number, phase: Phase) => del(`/budget/funds/${fundId}/contracts/${phase}`),
  suppliers: () => get<Supplier[]>("/budget/suppliers"),
  createSupplier: (name: string) => post("/budget/suppliers", { name }),
  deleteSupplier: (id: number) => del(`/budget/suppliers/${id}`),
  inflows: (phase: Phase) => get<Inflow[]>(`/budget/inflows?phase=${phase}`),
  createInflow: (body: { phase: Phase; sourceName: string; amount: string; inflowDate?: string | null; sponsorship?: boolean }) =>
    post("/budget/inflows", body),
  deleteInflow: (id: number) => del(`/budget/inflows/${id}`),
  bank: () => get<Bank | null>("/budget/bank"),
  setBank: (body: { amount: string; asOfDate?: string | null }) => put("/budget/bank", body),
  clearBank: () => del("/budget/bank"),
  // views
  fundsSummary: (phase: Phase) =>
    get<{ rows: FundSummaryRow[]; monthly: MonthlyInflow[] }>(`/budget/views/funds-summary?phase=${phase}`),
  cashFlow: () =>
    get<{
      bank: { amountCents: number; asOfDate: string | null } | null;
      estimate: { summary: CashFlowSummary; monthly: MonthlyInflow[] };
      actual: { summary: CashFlowSummary; monthly: MonthlyInflow[] };
    }>("/budget/views/cashflow"),
  gantt: (phase: Phase) => get<Gantt>(`/budget/views/gantt?phase=${phase}`),
  // the three TOTAL pages choose their season, year or car on their own, whatever the menu says
  totals: (season: number) => get<TotalsView>(`/budget/views/totals?season=${season}`),
  yearTotals: (year: number) => get<TotalsView>(`/budget/views/totals/year?year=${year}`),
  carTotals: (car: string) => get<TotalsView>(`/budget/views/totals/car?car=${encodeURIComponent(car)}`),
  fundAnalysis: () => get<Analysis>("/budget/views/analysis/funds"),
  supplierAnalysis: () => get<Analysis>("/budget/views/analysis/suppliers"),
  items: (query: string) => get<ItemsView>(`/budget/views/items?${query}`),
};
