import { useQuery } from "@tanstack/react-query";
import { api, type ItemBody } from "../api/client";
import type { CategoryFields, InventoryItem, ItemDraft, ItemField, ItemType, ParamValues } from "../api/types";
import { editNumber, parseNumber } from "./params";

export const FIELD_LABELS: Record<ItemField, string> = {
  purpose: "What it is for",
  safetyCodes: "Safety codes",
  disposal: "How to dispose of it",
  storageNotes: "Storage",
  maintenanceNotes: "Maintenance",
};

export const FIELD_HINTS: Partial<Record<ItemField, string>> = {
  safetyCodes: "Hazard and precaution codes from the safety data sheet (H and P statements, UN number)",
};

/** The optional fields the form shows for a category (see getCategoryFields in the API). */
export function visibleFields(category: string | null | undefined, fields: CategoryFields): ItemField[] {
  return (category ? fields.byCategory[category] : undefined) ?? fields.fallback;
}

/** What an item can be: ticked on its form (whatever its category) and used to filter the list. */
export const HAZARDS = [
  { key: "flammable", label: "Flammable" },
  { key: "toxic", label: "Toxic" },
  { key: "carcinogenic", label: "Carcinogenic" },
] as const;

export const emptyDraft = (): ItemDraft => ({
  name: "", code: "", category: "", areaId: "", typeId: "", values: {}, unit: "pcs",
  purpose: "", safetyCodes: "", disposal: "", storageNotes: "", maintenanceNotes: "",
  flammable: false, toxic: false, carcinogenic: false,
});

/** The type chosen in a draft, if any. */
export const typeOf = (draft: Pick<ItemDraft, "typeId">, types: ItemType[]) => types.find((t) => String(t.id) === draft.typeId);

/** Whether the form asks flammable, toxic, carcinogenic: always, unless the type says it does not. */
export const asksHazards = (draft: Pick<ItemDraft, "typeId">, types: ItemType[]) => typeOf(draft, types)?.hazards ?? true;

export const draftOf = (item: InventoryItem, values: ParamValues, types: ItemType[]): ItemDraft => ({
  name: item.name,
  code: item.code ?? "",
  category: item.category ?? "",
  areaId: item.areaId === null ? "" : String(item.areaId),
  typeId: item.typeId === null ? "" : String(item.typeId),
  // numbers the way they are typed ("4.7k"), so that saving without touching them changes nothing
  values: Object.fromEntries(
    (types.find((t) => t.id === item.typeId)?.params ?? []).flatMap((p) => {
      const value = values[p.id];
      if (value === undefined) return [];
      return [[p.id, p.kind === "number" && typeof value === "string" ? editNumber(value, p) : value]];
    }),
  ),
  unit: item.unit,
  purpose: item.purpose ?? "",
  safetyCodes: item.safetyCodes ?? "",
  disposal: item.disposal ?? "",
  storageNotes: item.storageNotes ?? "",
  maintenanceNotes: item.maintenanceNotes ?? "",
  flammable: item.flammable,
  toxic: item.toxic,
  carcinogenic: item.carcinogenic,
});

/** The numbers of the draft that cannot be read, by parameter: the form says so under the box and does not send. */
export function paramErrors(draft: ItemDraft, types: ItemType[]): Record<number, string> {
  return Object.fromEntries(
    (typeOf(draft, types)?.params ?? []).flatMap((p) => {
      const text = draft.values[p.id];
      if (p.kind !== "number" || typeof text !== "string" || text.trim() === "" || parseNumber(text, p) !== null) return [];
      return [[p.id, p.prefixes ? "Not a number: write 4.7k, 4k7, 100n…" : "Not a number"]];
    }),
  );
}

/**
 * What to send for a draft. Only what the form shows is sent: a field hidden by the category, the
 * hazards of a type that does not ask them and the parameters of another type keep what they had,
 * and nothing the person cannot see is cleared. An empty text means "nothing".
 */
export function draftBody(draft: ItemDraft, lookups: { fields: CategoryFields; types: ItemType[] }): ItemBody {
  const type = typeOf(draft, lookups.types);
  const body: ItemBody = {
    name: draft.name.trim(),
    code: draft.code.trim() === "" ? null : draft.code.trim(),
    category: draft.category === "" ? null : draft.category,
    areaId: draft.areaId === "" ? null : Number(draft.areaId),
    typeId: type ? type.id : null,
    unit: draft.unit,
  };
  if (asksHazards(draft, lookups.types)) Object.assign(body, { flammable: draft.flammable, toxic: draft.toxic, carcinogenic: draft.carcinogenic });
  for (const field of visibleFields(draft.category, lookups.fields)) {
    body[field] = draft[field].trim() === "" ? null : draft[field].trim();
  }
  if (type && type.params.length > 0) {
    body.params = type.params.map((p) => {
      const typed = draft.values[p.id];
      if (p.kind === "yesno") return { paramId: p.id, value: typed === true };
      const text = typeof typed === "string" ? typed.trim() : "";
      return { paramId: p.id, value: text === "" ? null : p.kind === "number" ? (parseNumber(text, p) ?? text) : text };
    });
  }
  return body;
}

/** The lists the inventory forms are made of, or null while they load. */
export function useInventoryLookups() {
  const categories = useQuery({ queryKey: ["categories"], queryFn: api.categories });
  const units = useQuery({ queryKey: ["units"], queryFn: api.units });
  const locations = useQuery({ queryKey: ["locations"], queryFn: api.locations });
  const fields = useQuery({ queryKey: ["category-fields"], queryFn: api.categoryFields });
  const vatRates = useQuery({ queryKey: ["vat-rates"], queryFn: api.vatRates });
  const areas = useQuery({ queryKey: ["areas"], queryFn: api.areas });
  const types = useQuery({ queryKey: ["item-types"], queryFn: api.itemTypes });
  if (!categories.data || !units.data || !locations.data || !fields.data || !vatRates.data || !areas.data || !types.data) return null;
  return {
    categories: categories.data, units: units.data, locations: locations.data, fields: fields.data, vatRates: vatRates.data,
    areas: areas.data, types: types.data,
  };
}

export type InventoryLookups = NonNullable<ReturnType<typeof useInventoryLookups>>;
