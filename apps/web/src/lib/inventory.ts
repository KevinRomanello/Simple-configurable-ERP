import { useQuery } from "@tanstack/react-query";
import { api, type ItemBody } from "../api/client";
import type { CategoryFields, InventoryItem, ItemDraft, ItemField } from "../api/types";

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
  name: "", code: "", category: "", unit: "pcs", purpose: "", safetyCodes: "", disposal: "", storageNotes: "", maintenanceNotes: "",
  flammable: false, toxic: false, carcinogenic: false,
});

export const draftOf = (item: InventoryItem): ItemDraft => ({
  name: item.name,
  code: item.code ?? "",
  category: item.category ?? "",
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

/**
 * What to send for a draft. Only the fields the category shows are sent: a field that is hidden
 * (because the category changed) keeps what it had, and nothing the person cannot see is cleared.
 * An empty text means "nothing".
 */
export function draftBody(draft: ItemDraft, fields: CategoryFields): ItemBody {
  const body: ItemBody = {
    name: draft.name.trim(),
    code: draft.code.trim() === "" ? null : draft.code.trim(),
    category: draft.category === "" ? null : draft.category,
    unit: draft.unit,
    flammable: draft.flammable,
    toxic: draft.toxic,
    carcinogenic: draft.carcinogenic,
  };
  for (const field of visibleFields(draft.category, fields)) {
    body[field] = draft[field].trim() === "" ? null : draft[field].trim();
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
  if (!categories.data || !units.data || !locations.data || !fields.data || !vatRates.data) return null;
  return { categories: categories.data, units: units.data, locations: locations.data, fields: fields.data, vatRates: vatRates.data };
}

export type InventoryLookups = NonNullable<ReturnType<typeof useInventoryLookups>>;
