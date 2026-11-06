import type {
  Analysis, Area, AreaSheet, Bank, Calculation, CashFlowSummary, CategoryFields, ComponentDetail, ComponentRow, Fund, FundSummaryRow, FundType, Gantt, HistoryPage, Inflow, InventoryItem, ItemDetail, ItemField, ItemRow, ItemsView, ItemType, Location, Me, MonthlyInflow, NewContract, ParamKind, PendingRow, Phase, PriceBasis, PriceChoice, ProjectRef, Role, Season, SettingsView, SignInOptions, SponsorBody, StatsResult, Supplier, TotalsView, TypeParam, UserRow, VatReport,
} from "./types";
import type { NewLineBody } from "../lib/newLine";
import { chosenSeasonId } from "../lib/seasonChoice";

/** An error answer of the API: carries the HTTP status so screens can react to a 409. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The session is missing, expired or was revoked: the person has to sign in again. */
export const isUnauthorized = (error: unknown) => error instanceof ApiError && error.status === 401;

/**
 * What to tell the person about a refused request: the server's sentence and, for input that did
 * not pass validation, which field and why ("amount: The value cannot be more than 1,000,000,000").
 */
export function errorMessage(payload: unknown, fallback: string): string {
  const body = payload as { error?: unknown; issues?: { path?: unknown[]; message?: unknown }[] } | null;
  const issue = body?.issues?.[0];
  const reason = typeof issue?.message === "string" ? issue.message : null;
  const field = issue?.path?.length ? `${issue.path.join(".")}: ` : "";
  if (reason) return `${field}${reason}`;
  return typeof body?.error === "string" ? body.error : fallback;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  // every request is about the season chosen in the menu; without one, the server takes today's
  const season = chosenSeasonId();
  const response = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(season === null ? {} : { "X-Season": String(season) }),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, errorMessage(payload, response.statusText));
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
  /** The funds that pay the line, in order; an empty list clears them. */
  fundIds?: number[];
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
  /** The car of another season the line is bought for; null = the car of its own season. */
  carSeasonId?: number | null;
  figures?: Partial<Record<Phase, FiguresPatch>>;
}

/** The price selector as the query string the inventory endpoints take. */
export function priceQuery(price: PriceChoice, extra: Record<string, string | undefined> = {}): string {
  const params = new URLSearchParams({ basis: price.basis, method: price.method });
  if (price.on) params.set("on", price.on);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  return params.toString();
}

/** What the form of an item sends: empty texts mean "nothing". */
export interface ItemBody {
  name?: string;
  code?: string | null;
  category?: string | null;
  areaId?: number | null;
  typeId?: number | null;
  /** The parameters of the type: a number as an exact decimal, null clears one. Those left out keep what they had. */
  params?: { paramId: number; value: string | boolean | null }[];
  unit?: string;
  purpose?: string | null;
  safetyCodes?: string | null;
  disposal?: string | null;
  storageNotes?: string | null;
  maintenanceNotes?: string | null;
  flammable?: boolean;
  toxic?: boolean;
  carcinogenic?: boolean;
  origin?: "bought" | "made";
}

/** What makes a type, and a parameter of it (the choices of a list, when changed, say which old one each is). */
export interface TypeBody {
  name?: string;
  areaId?: number | null;
  hazards?: boolean;
}
export interface ParamBody {
  name: string;
  kind: ParamKind;
  unit?: string | null;
  prefixes?: boolean;
  choices?: string[];
}
export type ParamPatch = Partial<Omit<ParamBody, "choices">> & { choices?: { was?: string; name: string }[] };

/** What the form of a build sends: the parts come from one place, the pieces go to another. */
export interface BuildBody {
  componentId: number;
  projectId: number;
  quantity: string;
  builtOn: string;
  fromLocation: string;
  toLocation: string;
  toSpot: string;
  method: "average" | "last";
  note?: string;
}

/** Where a data sheet is read: a plain link, so the file is fetched only when somebody clicks it. */
export const datasheetUrl = (id: number) => `/api/inventory/datasheets/${id}`;

export interface ReceiveBody {
  lineId?: number;
  itemId?: number;
  newItem?: ItemBody;
  quantity: string;
  receivedOn: string;
  location: string;
  spot: string;
  unitNet?: string;
  vatRate?: number;
  free?: boolean;
  projectId?: number;
  /** Goods from outside the budget for the car of another season. */
  carSeasonId?: number;
  note?: string;
}

export interface MovementBody {
  itemId: number;
  kind: "use" | "transfer" | "adjustment" | "disposal";
  quantity?: string;
  counted?: string;
  occurredOn: string;
  location: string;
  spot: string;
  toLocation?: string;
  toSpot?: string;
  projectId?: number;
  note?: string;
}

export const api = {
  // sign-in
  signInOptions: () => get<SignInOptions>("/auth/config"),
  /** The signed-in person, or null when nobody is signed in. */
  me: async (): Promise<Me | null> => {
    try {
      return await get<Me>("/me");
    } catch (error) {
      if (isUnauthorized(error)) return null;
      throw error;
    }
  },
  signOut: () => post<void>("/auth/logout", {}),

  // users and history
  users: () => get<UserRow[]>("/users"),
  updateUser: (id: number, body: { role?: Role; active?: boolean; areaIds?: number[] }) =>
    patch<UserRow>(`/users/${id}`, body),
  history: (query: { table?: string; before?: number }) => {
    const params = new URLSearchParams({ limit: "50" });
    if (query.table) params.set("table", query.table);
    if (query.before) params.set("before", String(query.before));
    return get<HistoryPage>(`/audit?${params}`);
  },

  // the Settings page (admin)
  settings: () => get<SettingsView>("/settings"),
  createCategory: (name: string) => post<{ id: number }>("/settings/categories", { name }),
  updateCategory: (id: number, body: { name?: string; fields?: ItemField[] }) => patch<void>(`/settings/categories/${id}`, body),
  deleteCategory: (id: number) => del(`/settings/categories/${id}`),
  orderCategories: (ids: number[]) => put<void>("/settings/categories/order", { ids }),
  setUncategorizedFields: (fields: ItemField[]) => put<void>("/settings/uncategorized-fields", { fields }),
  createVatRate: (rate: number) => post<{ id: number }>("/settings/vat-rates", { rate }),
  deleteVatRate: (id: number) => del(`/settings/vat-rates/${id}`),
  createUnit: (name: string) => post<{ id: number }>("/settings/units", { name }),
  renameUnit: (id: number, name: string) => patch<void>(`/settings/units/${id}`, { name }),
  deleteUnit: (id: number) => del(`/settings/units/${id}`),
  createLocation: (body: { site: string; room: string }) => post<{ id: number; code: string }>("/settings/locations", body),
  updateLocation: (id: number, body: { site?: string; room?: string }) => patch<void>(`/settings/locations/${id}`, body),
  deleteLocation: (id: number) => del(`/settings/locations/${id}`),
  orderLocations: (ids: number[]) => put<void>("/settings/locations/order", { ids }),
  updateCalculation: (body: Partial<Omit<Calculation, "bankCompare">> & { bankCompare?: Partial<Calculation["bankCompare"]> }) =>
    patch<void>("/settings/calculation", body),

  // inventory
  locations: () => get<Location[]>("/lookups/locations"),
  units: () => get<string[]>("/lookups/units"),
  categoryFields: () => get<CategoryFields>("/lookups/category-fields"),
  inventoryProjects: () => get<ProjectRef[]>("/inventory/projects"),
  inventoryItems: (price: PriceChoice, filters: Record<string, string | undefined> = {}) =>
    get<ItemRow[]>(`/inventory/items?${priceQuery(price, filters)}`),
  inventoryItem: (id: number, price: PriceChoice) => get<ItemDetail>(`/inventory/items/${id}?${priceQuery(price)}`),
  createItem: (body: ItemBody) => post<InventoryItem>("/inventory/items", body),
  updateItem: (id: number, body: ItemBody) => patch<InventoryItem>(`/inventory/items/${id}`, body),
  deleteItem: (id: number) => del(`/inventory/items/${id}`),
  setImage: (id: number, body: { mime: string; full: string; thumb: string }) => put<void>(`/inventory/items/${id}/image`, body),
  removeImage: (id: number) => del(`/inventory/items/${id}/image`),
  pending: () => get<PendingRow[]>("/inventory/pending"),
  receive: (body: ReceiveBody) => post<{ item: InventoryItem }>("/inventory/receive", body),
  addMovement: (body: MovementBody) => post("/inventory/movements", body),
  build: (body: BuildBody) => post("/inventory/builds", body),
  undoMovement: (id: number) => del(`/inventory/movements/${id}`),
  /** The PDF is sent as it is (not as JSON), with its name in the address. */
  addDatasheet: async (itemId: number, file: File, name: string) => {
    const response = await fetch(`/api/inventory/items/${itemId}/datasheets?name=${encodeURIComponent(name)}`, {
      method: "POST",
      headers: { "Content-Type": "application/pdf" },
      body: file,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(response.status, errorMessage(payload, response.statusText));
    return payload as { id: number };
  },
  removeDatasheet: (id: number) => del(`/inventory/datasheets/${id}`),
  components: (price: PriceChoice) => get<ComponentRow[]>(`/inventory/components?${priceQuery(price)}`),
  component: (id: number, price: PriceChoice) => get<ComponentDetail>(`/inventory/components/${id}?${priceQuery(price)}`),
  addPart: (componentId: number, body: { partId: number; quantity: string; note?: string }) =>
    post(`/inventory/components/${componentId}/parts`, body),
  updatePart: (componentId: number, partId: number, body: { quantity?: string; note?: string }) =>
    patch(`/inventory/components/${componentId}/parts/${partId}`, body),
  removePart: (componentId: number, partId: number) => del(`/inventory/components/${componentId}/parts/${partId}`),
  inventoryStats: (by: StatsResult["by"], basis: PriceBasis) => get<StatsResult>(`/inventory/stats?by=${by}&basis=${basis}`),
  itemTypes: () => get<ItemType[]>("/inventory/types"),
  createType: (body: TypeBody & { name: string }) => post<ItemType>("/inventory/types", body),
  updateType: (id: number, body: TypeBody) => patch<ItemType>(`/inventory/types/${id}`, body),
  deleteType: (id: number) => del(`/inventory/types/${id}`),
  addParam: (typeId: number, body: ParamBody) => post<TypeParam>(`/inventory/types/${typeId}/params`, body),
  updateParam: (id: number, body: ParamPatch) => patch<TypeParam>(`/inventory/params/${id}`, body),
  deleteParam: (id: number) => del(`/inventory/params/${id}`),
  orderParams: (typeId: number, ids: number[]) => put<void>(`/inventory/types/${typeId}/params/order`, { ids }),

  // lookups
  categories: () => get<string[]>("/lookups/categories"),
  priorities: () => get<string[]>("/lookups/priorities"),
  vatRates: () => get<number[]>("/lookups/vat-rates"),
  /** The VAT rate that some kinds of sponsor cannot choose (goods: 0, goods against a counter-invoice: 11). */
  fixedSponsorRates: () => get<Partial<Record<FundType, number>>>("/lookups/sponsor-rates"),

  // seasons
  seasons: () => get<Season[]>("/seasons"),
  createSeason: (body: { startYear: number; car: string }) => post<Season>("/seasons", body),
  updateSeason: (id: number, body: { car?: string; readOnly?: boolean }) => patch(`/seasons/${id}`, body),

  // budget
  areas: () => get<Area[]>("/areas"),
  sheet: (code: string) => get<AreaSheet>(`/areas/${code}/sheet`),
  vatReport: (code: string) => get<VatReport>(`/views/vat-report?area=${code}`),
  createProject: (body: { areaCode: string; name: string; ownerName?: string | null }) => post("/projects", body),
  updateProject: (id: number, body: { name?: string; ownerName?: string | null }) => patch(`/projects/${id}`, body),
  deleteProject: (id: number) => del(`/projects/${id}`),
  createLine: (projectId: number, body: NewLineBody) => post(`/projects/${projectId}/lines`, body),
  updateLine: (id: number, body: LinePatch) => patch(`/lines/${id}`, body),
  deleteLine: (id: number) => del(`/lines/${id}`),

  // funds, suppliers, cash flow
  funds: (phase?: Phase) => get<Fund[]>(`/funds${phase ? `?phase=${phase}` : ""}`),
  createFund: (body: Partial<SponsorBody> & { name: string; contracts?: NewContract[] }) => post<Fund>("/funds", body),
  updateFund: (id: number, body: Partial<SponsorBody>) => patch<Fund>(`/funds/${id}`, body),
  deleteFund: (id: number) => del(`/funds/${id}`),
  setContract: (fundId: number, phase: Phase, body: { amount: string; inflowDate: string | null }) =>
    put(`/funds/${fundId}/contracts/${phase}`, body),
  clearContract: (fundId: number, phase: Phase) => del(`/funds/${fundId}/contracts/${phase}`),
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
  // the three TOTAL pages choose their season, year or car on their own, whatever the menu says
  totals: (season: number) => get<TotalsView>(`/views/totals?season=${season}`),
  yearTotals: (year: number) => get<TotalsView>(`/views/totals/year?year=${year}`),
  carTotals: (car: string) => get<TotalsView>(`/views/totals/car?car=${encodeURIComponent(car)}`),
  fundAnalysis: () => get<Analysis>("/views/analysis/funds"),
  supplierAnalysis: () => get<Analysis>("/views/analysis/suppliers"),
  items: (query: string) => get<ItemsView>(`/views/items?${query}`),
};
