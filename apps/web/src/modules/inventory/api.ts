// The calls of inventory to the API (split from api/client.ts in G7: docs/moduli-architettura.md, §7.1).
import { ApiError, del, errorMessage, get, patch, post, put } from "../../core/api";
import type { PriceBasis } from "../../core/calcTypes";
import type { CategoryFields, ComponentDetail, ComponentRow, InventoryItem, InventoryLists, ItemDetail, ItemField, ItemRow, ItemType, Location, ParamKind, PlanView, PriceChoice, StatsResult, TypeParam } from "./types";

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
  brand?: string | null;
  model?: string | null;
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
  /** Only for what the team makes: the project, and where the pieces go. */
  makeProjectId?: number | null;
  makeTo?: string | null;
  makeToSpot?: string;
}

/** What makes a type, and a parameter of it (the choices of a list, when changed, say which old one each is). */
export interface TypeBody {
  name?: string;
  areaId?: number | null;
  hazards?: boolean;
  categoryId?: number;
  /** The type it is a kind of; null makes it a type of its own. */
  parentId?: number | null;
}
export interface ParamBody {
  name: string;
  kind: ParamKind;
  unit?: string | null;
  prefixes?: boolean;
  choices?: string[];
}
export type ParamPatch = Partial<Omit<ParamBody, "choices">> & { choices?: { was?: string; name: string }[] };

/** What the form of a build sends: the parts come from the shelf (a part only from the place chosen for it), the pieces go to a place. */
export interface BuildBody {
  componentId: number;
  projectId: number;
  quantity: string;
  builtOn: string;
  /** Part id -> place, for the parts that are taken from one place only. */
  takeFrom: Record<number, string>;
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



export const inventoryApi = {
  // inventory
  locations: () => get<Location[]>("/inventory/locations"),
  units: () => get<string[]>("/inventory/units"),
  categoryFields: () => get<CategoryFields>("/inventory/category-fields"),
  // the inventory's lists on the Settings page (Settings › Inventory): the fields of each category, the units, the places
  inventoryLists: () => get<InventoryLists>("/inventory/lists"),
  setCategoryFields: (categoryId: number, fields: ItemField[]) => put<void>(`/inventory/category-fields/${categoryId}`, { fields }),
  setUncategorizedFields: (fields: ItemField[]) => put<void>("/inventory/uncategorized-fields", { fields }),
  createUnit: (name: string) => post<{ id: number }>("/inventory/units", { name }),
  renameUnit: (id: number, name: string) => patch<void>(`/inventory/units/${id}`, { name }),
  deleteUnit: (id: number) => del(`/inventory/units/${id}`),
  /** One place, or one for each level named (all or none). */
  createLocation: (body: { room: string; shelf?: string; levels?: string[] }) => post<{ id: number; code: string; created: number }>("/inventory/locations", body),
  updateLocation: (id: number, body: { room?: string; shelf?: string; level?: string }) => patch<void>(`/inventory/locations/${id}`, body),
  deleteLocation: (id: number) => del(`/inventory/locations/${id}`),
  orderLocations: (ids: number[]) => put<void>("/inventory/locations/order", { ids }),
  inventoryItems: (price: PriceChoice, filters: Record<string, string | undefined> = {}) =>
    get<ItemRow[]>(`/inventory/items?${priceQuery(price, filters)}`),
  inventoryItem: (id: number, price: PriceChoice) => get<ItemDetail>(`/inventory/items/${id}?${priceQuery(price)}`),
  createItem: (body: ItemBody) => post<InventoryItem>("/inventory/items", body),
  updateItem: (id: number, body: ItemBody) => patch<InventoryItem>(`/inventory/items/${id}`, body),
  deleteItem: (id: number) => del(`/inventory/items/${id}`),
  setImage: (id: number, body: { mime: string; full: string; thumb: string }) => put<void>(`/inventory/items/${id}/image`, body),
  removeImage: (id: number) => del(`/inventory/items/${id}/image`),
  /** Goods that arrive: for a purchase of the budget through the bridge to the budget (its line prices them), else priced by hand. */
  receive: ({ lineId, ...body }: ReceiveBody) =>
    post<{ item: InventoryItem }>(lineId === undefined ? "/inventory/receive" : `/inventory-budget/pending/${lineId}/receive`, body),
  addMovement: (body: MovementBody) => post("/inventory/movements", body),
  build: (body: BuildBody) => post("/inventory/builds", body),
  undoMovement: (id: number) => del(`/inventory/movements/${id}`),
  removeDatasheet: (id: number) => del(`/inventory/datasheets/${id}`),
  /** `filters`: search, area (a code), type and project (ids). */
  components: (price: PriceChoice, filters: Record<string, string | undefined> = {}) => get<ComponentRow[]>(`/inventory/components?${priceQuery(price, filters)}`),
  /** `from`: part id -> place, for the parts taken from one place only (the others come from wherever they are). */
  componentPlan: (id: number, ask: { quantity: string; from: Record<number, string> }) => {
    const query = new URLSearchParams({ quantity: ask.quantity });
    for (const [partId, place] of Object.entries(ask.from)) query.append("from", `${partId}:${place}`);
    return get<PlanView>(`/inventory/components/${id}/plan?${query}`);
  },
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
};
