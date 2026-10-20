import type {
  Analysis, Area, AreaSheet, Bank, CashFlowSummary, Contract, Fund, FundSummaryRow, Gantt, Inflow,
  ItemsView, MonthlyInflow, Phase, Supplier, Totals, VatReport,
} from "./types";

/** An error answer of the API: carries the HTTP status so screens can react to a 409. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, payload?.error ?? response.statusText);
  return payload as T;
}

const get = <T>(path: string) => request<T>("GET", path);
const post = <T>(path: string, body: unknown) => request<T>("POST", path, body);
const patch = <T>(path: string, body: unknown) => request<T>("PATCH", path, body);
const put = <T>(path: string, body: unknown) => request<T>("PUT", path, body);
const del = (path: string) => request<void>("DELETE", path);

/** What the budget grid sends when a cell changes (see docs/architettura.md, API). */
export interface FiguresPatch {
  quantity?: number | null;
  unitNetCost?: number | null;
  sponsorType?: string | null;
  sponsorValue?: number | null;
  vatRate?: number | null;
  fundId?: number | null;
  supplierId?: number | null;
  purchaseDate?: string | null;
  arrivalDate?: string | null;
}
export interface LinePatch {
  version: number;
  item?: string;
  category?: string | null;
  priority?: string | null;
  note?: string | null;
  figures?: Partial<Record<Phase, FiguresPatch>>;
}

export const api = {
  // lookups
  categories: () => get<string[]>("/lookups/categories"),
  priorities: () => get<string[]>("/lookups/priorities"),
  vatRates: () => get<number[]>("/lookups/vat-rates"),

  // budget
  areas: () => get<Area[]>("/areas"),
  sheet: (code: string) => get<AreaSheet>(`/areas/${code}/sheet`),
  vatReport: (code: string) => get<VatReport>(`/views/vat-report?area=${code}`),
  createProject: (body: { areaCode: string; name: string; ownerName?: string | null }) => post("/projects", body),
  updateProject: (id: number, body: { name?: string; ownerName?: string | null }) => patch(`/projects/${id}`, body),
  deleteProject: (id: number) => del(`/projects/${id}`),
  createLine: (projectId: number, item: string) => post(`/projects/${projectId}/lines`, { item }),
  updateLine: (id: number, body: LinePatch) => patch(`/lines/${id}`, body),
  deleteLine: (id: number) => del(`/lines/${id}`),

  // funds, suppliers, cash flow
  funds: (phase?: Phase) => get<Fund[]>(`/funds${phase ? `?phase=${phase}` : ""}`),
  updateFund: (id: number, body: { paysVatEstimate?: boolean; paysVatActual?: boolean }) => patch(`/funds/${id}`, body),
  contracts: (phase: Phase) => get<Contract[]>(`/funds/contracts?phase=${phase}`),
  createContract: (body: { phase: Phase; fundName: string; amount: string; inflowDate?: string | null }) =>
    post("/funds/contracts", body),
  deleteContract: (id: number) => del(`/funds/contracts/${id}`),
  suppliers: () => get<Supplier[]>("/suppliers"),
  createSupplier: (name: string) => post("/suppliers", { name }),
  deleteSupplier: (id: number) => del(`/suppliers/${id}`),
  inflows: (phase: Phase) => get<Inflow[]>(`/inflows?phase=${phase}`),
  createInflow: (body: { phase: Phase; sourceName: string; amount: string; inflowDate?: string | null }) =>
    post("/inflows", body),
  deleteInflow: (id: number) => del(`/inflows/${id}`),
  bank: () => get<Bank | null>("/bank"),
  setBank: (body: { amount: string; asOfDate?: string | null }) => put("/bank", body),
  clearBank: () => del("/bank"),

  // views
  fundsSummary: (phase: Phase) =>
    get<{ rows: FundSummaryRow[]; monthly: MonthlyInflow[] }>(`/views/funds-summary?phase=${phase}`),
  cashFlow: () =>
    get<{
      bank: { amountCents: number; asOfDate: string | null } | null;
      estimate: { summary: CashFlowSummary; monthly: MonthlyInflow[] };
      actual: { summary: CashFlowSummary; monthly: MonthlyInflow[] };
    }>("/views/cashflow"),
  gantt: (phase: Phase) => get<Gantt>(`/views/gantt?phase=${phase}`),
  totals: () => get<Totals>("/views/totals"),
  fundAnalysis: () => get<Analysis>("/views/analysis/funds"),
  supplierAnalysis: () => get<Analysis>("/views/analysis/suppliers"),
  items: (query: string) => get<ItemsView>(`/views/items?${query}`),
};
