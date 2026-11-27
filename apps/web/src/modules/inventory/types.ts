// The shapes of the answers of inventory (split from api/types.ts in G7: docs/moduli-architettura.md, §7.1).
import type { Bom, CostPoint, ItemOrigin, MakePlan, PlanLine, PriceBasis, PriceMethod, PricePoint, StatsRow, Take } from "@erp/calc";

// --- inventory -----------------------------------------------------------------------------------

export interface Location {
  code: string;
  room: string;
  /** Empty when the place is the room itself. */
  shelf: string;
  /** A level of the shelf; empty when the place is the shelf itself. */
  level: string;
  /** "Room / Shelf / Level", the parts that are there. */
  label: string;
}
export type ItemField = "purpose" | "safetyCodes" | "disposal" | "storageNotes" | "maintenanceNotes";
export interface CategoryFields {
  fallback: ItemField[];
  byCategory: Record<string, ItemField[]>;
}
/** What is written in a parameter of an item type: a number (with its unit), one of a list, a text, a yes or no. */
export type ParamKind = "number" | "list" | "text" | "yesno";
export interface TypeParam {
  id: number;
  typeId: number;
  name: string;
  kind: ParamKind;
  /** A number: its unit (Ω, V, mm²). */
  unit: string | null;
  /** A number: written with k, M, m, µ… */
  prefixes: boolean;
  /** A list: what can be chosen. */
  choices: string[];
  position: number;
  /** It comes from a type above (the parameters of a parent are the ones of its sub-types too): `typeId` is where it is written. */
  inherited: boolean;
  /** How many items have something written in it. */
  filledIn: number;
}
/** A kind of thing the team keeps (Resistor, Screw…), with what is written about each one. */
export interface ItemType {
  id: number;
  name: string;
  /** The type this one is a kind of (IC for Op-amp); null for a type that is not under another. */
  parentId: number | null;
  /** How many types it is under: 0 for a root. The list is in the order of the tree. */
  depth: number;
  /** "IC › Op-amp": the names from the root. */
  path: string;
  /** null: every area. */
  areaId: number | null;
  /** Whether its items are asked flammable, toxic, carcinogenic. */
  hazards: boolean;
  /** The category of the budget its items belong to (they take it from here); null for a type made before this was asked. */
  categoryId: number | null;
  category: string | null;
  items: number;
  params: TypeParam[];
}
/** What is written about an item, by parameter: a number as an exact decimal in its unit ("4700"), a text, yes or no. */
export type ParamValues = Record<number, string | boolean>;
/** What is typed about an item (everything but the stock). */
export interface ItemDraft {
  name: string;
  /** The make and the model, as typed: "" for none. */
  brand: string;
  model: string;
  code: string;
  category: string;
  /** "" for none, else the id. */
  areaId: string;
  typeId: string;
  /** The parameters of the type as typed ("4.7k"); yes or no as a box. */
  values: Record<number, string | boolean>;
  unit: string;
  purpose: string;
  safetyCodes: string;
  disposal: string;
  storageNotes: string;
  maintenanceNotes: string;
  flammable: boolean;
  toxic: boolean;
  carcinogenic: boolean;
}
export interface InventoryItem {
  id: number;
  code: string | null;
  name: string;
  brand: string | null;
  model: string | null;
  purpose: string | null;
  category: string | null;
  areaId: number | null;
  typeId: number | null;
  unit: string;
  origin: ItemOrigin;
  safetyCodes: string | null;
  disposal: string | null;
  storageNotes: string | null;
  maintenanceNotes: string | null;
  flammable: boolean;
  toxic: boolean;
  carcinogenic: boolean;
  imageUpdatedAt: string | null;
  /** Only for what the team makes: what «Make new» starts from. */
  makeProjectId: number | null;
  makeTo: string | null;
  makeToSpot: string;
}
export interface ItemRow {
  id: number;
  code: string | null;
  name: string;
  brand: string | null;
  model: string | null;
  category: string | null;
  areaId: number | null;
  typeId: number | null;
  values: ParamValues;
  unit: string;
  origin: ItemOrigin;
  hasImage: boolean;
  onHandMilli: number;
  boughtMilli: number;
  unitE4: number | null;
  complete: boolean;
  valueCents: number | null;
  places: string[];
  flammable: boolean;
  toxic: boolean;
  carcinogenic: boolean;
}
export interface StockPlace {
  itemId: number;
  location: string;
  spot: string;
  quantityMilli: number;
  label: string;
}
export interface MovementRow {
  id: number;
  kind: "receipt" | "use" | "transfer" | "adjustment" | "disposal" | "build";
  on: string;
  quantity: string;
  location: string;
  spot: string;
  toLocation: string | null;
  toSpot: string | null;
  unitNet: string | null;
  unitGross: string | null;
  unitTeam: string | null;
  projectName: string | null;
  budgetLineId: number | null;
  /** The build that took these parts: they are undone together with it. */
  builtBy: number | null;
  note: string | null;
}
/** A data sheet as the page lists it: the file itself is fetched only when somebody opens it. */
export interface DatasheetRow {
  id: number;
  name: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedBy: string | null;
}
export interface ItemDetail {
  item: InventoryItem;
  values: ParamValues;
  datasheets: DatasheetRow[];
  hasImage: boolean;
  stock: StockPlace[];
  onHandMilli: number;
  boughtMilli: number;
  unitE4: number | null;
  complete: boolean;
  history: PricePoint[];
  movements: MovementRow[];
  bom: Bom | null;
  usedIn: { id: number; name: string }[];
}
export interface ComponentRow {
  id: number;
  name: string;
  unit: string;
  partsCount: number;
  unitE4: number | null;
  complete: boolean;
  onHandMilli: number;
  /** How many can be made with what is on the shelf, and the parts that stop the next one (the one missing most first). */
  canMakeMilli: number;
  limitedBy: string[];
}
export interface ComponentDetail {
  item: InventoryItem;
  bom: Bom;
  series: CostPoint[];
  notes: Record<number, string>;
  /** What is on the shelf of each part (all the places), by part id, in thousandths. */
  available: Record<number, number>;
  /** How many can be made with what is on the shelf (every place), and the parts that stop the next one. */
  canMakeMilli: number;
  limitedBy: string[];
}
/** One part of a plan: what it takes, where it would be taken from, and the places that hold some (the choices). */
export type PlanLineView = PlanLine & {
  takes: Take[];
  places: { location: string; quantityMilli: number }[];
  /** The only place it is taken from, when it was chosen; null: wherever it is. */
  takeFrom: string | null;
};
/** GET /api/inventory/components/:id/plan: what it takes to make some, against the shelf of every place. */
export type PlanView = Omit<MakePlan, "lines"> & {
  lines: PlanLineView[];
  unit: string;
  maxMilli: number;
  limitedBy: { partId: number; name: string }[];
};
export interface StatsResult {
  by: "project" | "area" | "category" | "location" | "car";
  basis: PriceBasis;
  /** The season shown: what was bought and used in its days. */
  season: { name: string; from: string; to: string };
  rows: StatsRow[];
}
/** Which price, read how, on which day: what the price selector holds. */
export interface PriceChoice {
  basis: PriceBasis;
  method: PriceMethod;
  on?: string;
}
/** GET /api/inventory/lists: the inventory's part of the Settings page. */
export interface InventoryLists {
  /** The fields of each category that has some, by category id (a category not there shows none). */
  categoryFields: Record<number, ItemField[]>;
  uncategorizedFields: ItemField[];
  units: { id: number; name: string; usedBy: number }[];
  locations: { id: number; code: string; room: string; shelf: string; level: string; label: string; usedBy: number }[];
}
