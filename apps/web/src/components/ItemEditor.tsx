import type { ItemDraft, TypeParam } from "../api/types";
import { asksHazards, FIELD_HINTS, FIELD_LABELS, paramErrors, typeOf, visibleFields, type InventoryLookups } from "../lib/inventory";
import { parseNumber, showNumber } from "../lib/params";
import { SearchSelect } from "./SearchSelect";
import { HazardChecks } from "./HazardPills";
import { Field } from "./ui";

/** A list with more choices than this gets a search box, like the other long lists. */
const SHORT_LIST = 8;

/**
 * The fields that describe an item: name, code, area, type, category, unit, what is written in
 * the parameters of its type, and the optional ones the category calls for. Used to create an
 * item and to edit it.
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
  const type = typeOf(draft, lookups.types);
  const errors = paramErrors(draft, lookups.types);
  const areaName = (areaId: number | null) => lookups.areas.find((a) => a.id === areaId)?.name ?? "every area";
  // the types of the chosen area and those of every area; all of them while no area is chosen
  const types = lookups.types.filter((t) => draft.areaId === "" || t.areaId === null || String(t.areaId) === draft.areaId || t.id === type?.id);
  const chooseType = (typeId: string) => {
    const chosen = lookups.types.find((t) => String(t.id) === typeId);
    onChange({ typeId, ...(draft.areaId === "" && chosen?.areaId != null ? { areaId: String(chosen.areaId) } : {}) });
  };

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
      <Field label="Area" htmlFor={`${idPrefix}-area`}>
        <select id={`${idPrefix}-area`} className="input small" value={draft.areaId} onChange={(e) => onChange({ areaId: e.target.value })}>
          <option value="">(every area)</option>
          {lookups.areas.map((a) => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
        </select>
      </Field>
      <Field label="Type" htmlFor={`${idPrefix}-type`}>
        <SearchSelect
          id={`${idPrefix}-type`}
          value={draft.typeId}
          onChange={chooseType}
          choices={[{ value: "", label: "(none)" }, ...types.map((t) => ({ value: String(t.id), label: draft.areaId === "" ? `${t.name} (${areaName(t.areaId)})` : t.name }))]}
        />
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
      {type && type.params.length > 0 && (
        <>
          <div className="wide filter-title">{type.name}</div>
          {type.params.map((param) => (
            <ParamField key={param.id} param={param} id={`${idPrefix}-p${param.id}`} value={draft.values[param.id]} error={errors[param.id]}
              onChange={(value) => onChange({ values: { ...draft.values, [param.id]: value } })} />
          ))}
        </>
      )}
      {asksHazards(draft, lookups.types) && <HazardChecks value={draft} onChange={(key, checked) => onChange({ [key]: checked })} />}
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

/** The box of one parameter, by its kind; a number says under it how it was read ("= 4,7 kΩ"). */
function ParamField({ param, id, value, error, onChange }: {
  param: TypeParam;
  id: string;
  value: string | boolean | undefined;
  error: string | undefined;
  onChange: (value: string | boolean) => void;
}) {
  if (param.kind === "yesno") {
    return (
      <label className="checkbox">
        <input id={id} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
        {param.name}
      </label>
    );
  }
  const text = typeof value === "string" ? value : "";
  if (param.kind === "list") {
    const choices = [{ value: "", label: "(none)" }, ...param.choices.map((c) => ({ value: c, label: c }))];
    return (
      <Field label={param.name} htmlFor={id}>
        {param.choices.length > SHORT_LIST ? (
          <SearchSelect id={id} value={text} onChange={onChange} choices={choices} />
        ) : (
          <select id={id} className="input small" value={text} onChange={(e) => onChange(e.target.value)}>
            {choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        )}
      </Field>
    );
  }
  const read = param.kind === "number" && text.trim() !== "" ? parseNumber(text, param) : null;
  return (
    <Field label={param.unit ? `${param.name} (${param.unit})` : param.name} htmlFor={id}>
      <input id={id} className="input small" maxLength={param.kind === "number" ? 40 : 200} placeholder={param.kind === "number" && param.prefixes ? "4.7k, 100n…" : undefined}
        value={text} onChange={(e) => onChange(e.target.value)} />
      {error ? <span className="hint error">{error}</span> : read !== null && <span className="hint">= {showNumber(read, param)}</span>}
    </Field>
  );
}
