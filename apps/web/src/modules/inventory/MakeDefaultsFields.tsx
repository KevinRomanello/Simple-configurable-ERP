import type { MakeDefaults, InventoryLookups } from "./inventory";
import { SearchSelect } from "../../core/SearchSelect";
import { Field } from "../../core/ui";
import { useProjects } from "./projects";

/**
 * What «Make new» starts from, set once when the thing is created (and changed on the item): the project the pieces are
 * made for and the place (and spot) the pieces are put in. All optional here; the form that makes some asks for what is
 * still missing. The parts are taken from wherever they are. docs/inventario.md, §21. `required`: the fields of the form
 * that makes some (the project and the place have to be chosen), not of the item.
 */
export function MakeDefaultsFields({ value, onChange, lookups, idPrefix = "make", required = false }: {
  value: MakeDefaults;
  onChange: (change: Partial<MakeDefaults>) => void;
  lookups: InventoryLookups;
  idPrefix?: string;
  required?: boolean;
}) {
  const none = required ? "Choose…" : "(choose each time)";
  const projects = useProjects();
  const places = lookups.locations.map((l) => <option key={l.code} value={l.code}>{l.label}</option>);

  return (
    <div className="form-grid">
      {!required && <div className="wide filter-title">When the team makes it</div>}
      <Field label="For project" htmlFor={`${idPrefix}-project`}>
        <SearchSelect
          id={`${idPrefix}-project`}
          value={value.projectId}
          onChange={(projectId) => onChange({ projectId })}
          choices={[{ value: "", label: none }, ...(projects.data ?? []).map((p) => ({ value: String(p.id), label: `${p.areaName}: ${p.name}` }))]}
        />
      </Field>
      <Field label="Put the pieces in" htmlFor={`${idPrefix}-to`}>
        <select id={`${idPrefix}-to`} className="input small" value={value.to} onChange={(e) => onChange({ to: e.target.value })}>
          {!required && <option value="">{none}</option>}
          {places}
        </select>
      </Field>
      <Field label="Exactly" htmlFor={`${idPrefix}-spot`}>
        <input id={`${idPrefix}-spot`} className="input small" maxLength={100} placeholder="Optional" value={value.spot} onChange={(e) => onChange({ spot: e.target.value })} />
      </Field>
    </div>
  );
}
