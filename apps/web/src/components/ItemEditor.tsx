import type { ItemDraft } from "../api/types";
import { FIELD_HINTS, FIELD_LABELS, visibleFields, type InventoryLookups } from "../lib/inventory";
import { SearchSelect } from "./SearchSelect";
import { HazardChecks } from "./HazardPills";
import { Field } from "./ui";

/**
 * The fields that describe an item: name, code, category, unit, and the optional ones the
 * category calls for. Used to create an item and to edit it.
 */
export function ItemEditor({
  draft, onChange, lookups, idPrefix = "item",
}: {
  draft: ItemDraft;
  onChange: (change: Partial<ItemDraft>) => void;
  lookups: InventoryLookups;
  idPrefix?: string;
}) {
  const shown = visibleFields(draft.category, lookups.fields);
  return (
    <div className="form-grid">
      <Field>
        <label htmlFor={`${idPrefix}-name`}>Name</label>
        <input id={`${idPrefix}-name`} className="input small" maxLength={200} value={draft.name} onChange={(e) => onChange({ name: e.target.value })} />
      </Field>
      <Field>
        <label htmlFor={`${idPrefix}-code`}>Code (optional)</label>
        <input id={`${idPrefix}-code`} className="input small" maxLength={50} value={draft.code} onChange={(e) => onChange({ code: e.target.value })} />
      </Field>
      <Field>
        <label htmlFor={`${idPrefix}-category`}>Category</label>
        <SearchSelect
          id={`${idPrefix}-category`}
          value={draft.category}
          onChange={(category) => onChange({ category })}
          choices={[{ value: "", label: "(none)" }, ...lookups.categories.map((c) => ({ value: c, label: c }))]}
        />
      </Field>
      <Field>
        <label htmlFor={`${idPrefix}-unit`}>Counted in</label>
        <select id={`${idPrefix}-unit`} className="input small" value={draft.unit} onChange={(e) => onChange({ unit: e.target.value })}>
          {lookups.units.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </Field>
      <HazardChecks value={draft} onChange={(key, checked) => onChange({ [key]: checked })} />
      {shown.map((field) => (
        <div className="field wide" key={field}>
          <label htmlFor={`${idPrefix}-${field}`}>{FIELD_LABELS[field]}</label>
          <textarea id={`${idPrefix}-${field}`} className="input small" rows={2} maxLength={5000} value={draft[field]} onChange={(e) => onChange({ [field]: e.target.value })} />
          {FIELD_HINTS[field] && <span className="hint">{FIELD_HINTS[field]}</span>}
        </div>
      ))}
    </div>
  );
}
