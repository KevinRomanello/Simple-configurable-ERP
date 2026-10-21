import type { ItemDraft } from "../api/types";
import { FIELD_HINTS, FIELD_LABELS, visibleFields, type InventoryLookups } from "../lib/inventory";

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
      <div className="field">
        <label htmlFor={`${idPrefix}-name`}>Name</label>
        <input id={`${idPrefix}-name`} className="input small" maxLength={200} value={draft.name} onChange={(e) => onChange({ name: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-code`}>Code (optional)</label>
        <input id={`${idPrefix}-code`} className="input small" maxLength={50} value={draft.code} onChange={(e) => onChange({ code: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-category`}>Category</label>
        <select id={`${idPrefix}-category`} className="input small" value={draft.category} onChange={(e) => onChange({ category: e.target.value })}>
          <option value="">(none)</option>
          {lookups.categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-unit`}>Counted in</label>
        <select id={`${idPrefix}-unit`} className="input small" value={draft.unit} onChange={(e) => onChange({ unit: e.target.value })}>
          {lookups.units.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>
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
