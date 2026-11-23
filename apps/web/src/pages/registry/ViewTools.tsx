import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import type { Condition, ConditionOp, Filter, Sort } from "@erp/registry";
import type { RegField } from "../../api/registry";
import { Button, IconButton } from "../../components/Button";
import { Chips } from "../../components/Chips";
import { opsFor, WITHIN_PERIODS } from "../../lib/registry";

// The tools of a view: the conditions of a filter, the sorts, the fields shown. One level of conditions joined
// by AND or OR is what the page edits; the API takes groups inside groups too (docs/anagrafiche.md, §6).

const flatConditions = (filter: Filter | undefined): Condition[] => (filter?.items ?? []).filter((i): i is Condition => !("items" in i));

/** A value of a condition as the person types it: lists as "a, b". */
const valueText = (v: unknown) => (Array.isArray(v) ? v.join(", ") : v === undefined || v === null ? "" : String(v));
const LIST_OPS: ConditionOp[] = ["anyOf", "allOf", "noneOf", "notAllOf"];

/** The period of an "is within" condition: a name, with its number of days or its two days when it needs them. */
function WithinValue({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const [name, a, b] = Array.isArray(value) ? value : [value];
  const period = WITHIN_PERIODS.find((p) => p.value === name) ?? WITHIN_PERIODS[0]!;
  const make = (next: string, x?: unknown, y?: unknown) => {
    const p = WITHIN_PERIODS.find((q) => q.value === next)!;
    onChange(p.days ? [next, Number(x ?? 7)] : p.range ? [next, x ?? "", y ?? ""] : next);
  };
  return (
    <>
      <select className="input small" aria-label="Period" value={period.value} onChange={(e) => make(e.target.value)}>
        {WITHIN_PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select>
      {period.days && <input className="input small" type="number" min={0} aria-label="Days" value={String(a ?? 7)} onChange={(e) => make(period.value, e.target.value)} />}
      {period.range && (
        <>
          <input className="input small" type="date" aria-label="From" value={String(a ?? "")} onChange={(e) => make(period.value, e.target.value, b)} />
          <input className="input small" type="date" aria-label="To" value={String(b ?? "")} onChange={(e) => make(period.value, a, e.target.value)} />
        </>
      )}
    </>
  );
}

export function FilterEditor({ fields, filter, onChange, idPrefix }: { fields: RegField[]; filter: Filter | undefined; onChange: (filter: Filter) => void; idPrefix: string }) {
  const join = filter?.join ?? "and";
  const not = filter?.not === true;
  const conditions = flatConditions(filter);
  const usable = fields.filter((f) => f.type !== "button");
  const set = (items: Condition[], j = join, n = not) => onChange({ join: j, items, ...(n ? { not: true } : {}) });
  const update = (i: number, change: Partial<Condition>) => set(conditions.map((c, k) => (k === i ? { ...c, ...change } : c)));

  return (
    <div className="stack tight">
      {conditions.length > 0 && (
        <div className="inline-form">
          {conditions.length > 1 && <Chips label="Join the conditions" value={join} onChange={(j) => set(conditions, j)} options={[{ value: "and", label: "All of them" }, { value: "or", label: "Any of them" }]} />}
          <label className="checkbox">
            <input type="checkbox" checked={not} onChange={(e) => set(conditions, join, e.target.checked)} />
            The records that do not match
          </label>
        </div>
      )}
      {conditions.map((c, i) => {
        const field = fields.find((f) => f.id === c.field);
        const ops = field ? opsFor(field.type) : [];
        const op = ops.find((o) => o.op === c.op);
        return (
          <div key={i} className="inline-form">
            <select className="input small" aria-label="Field" value={c.field} onChange={(e) => update(i, { field: Number(e.target.value), op: opsFor(fields.find((f) => f.id === Number(e.target.value))!.type)[0]!.op, value: undefined })}>
              {usable.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <select className="input small" aria-label="Condition" value={c.op} onChange={(e) => update(i, { op: e.target.value as ConditionOp, value: e.target.value === "within" ? "pastWeek" : c.op === "within" ? undefined : c.value })}>
              {ops.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
            </select>
            {c.op === "within" ? (
              <WithinValue value={c.value} onChange={(value) => update(i, { value })} />
            ) : op?.value && field?.type === "select" && !LIST_OPS.includes(c.op) ? (
              <select className="input small" aria-label="Value" value={valueText(c.value)} onChange={(e) => update(i, { value: e.target.value })}>
                <option value="">—</option>
                {(field.options.choices ?? []).map((ch) => <option key={ch.name}>{ch.name}</option>)}
              </select>
            ) : op?.value ? (
              <input
                id={`${idPrefix}-value-${i}`}
                className="input small"
                aria-label="Value"
                placeholder={LIST_OPS.includes(c.op) ? "a, b, c" : field?.type === "date" ? "YYYY-MM-DD or today-7" : field?.type.includes("link") ? "a name, or @me" : ""}
                value={valueText(c.value)}
                onChange={(e) => update(i, { value: LIST_OPS.includes(c.op) ? e.target.value.split(",").map((s) => s.trim()).filter(Boolean) : e.target.value })}
              />
            ) : null}
            <IconButton icon={faTrash} label="Remove the condition" onClick={() => set(conditions.filter((_, k) => k !== i))} />
          </div>
        );
      })}
      {usable.length > 0 && (
        <div>
          <Button small variant="ghost" icon={faPlus} onClick={() => set([...conditions, { field: usable[0]!.id, op: opsFor(usable[0]!.type)[0]!.op }])}>Add a condition</Button>
        </div>
      )}
    </div>
  );
}

export function SortEditor({ fields, sorts, onChange }: { fields: RegField[]; sorts: Sort[]; onChange: (sorts: Sort[]) => void }) {
  const usable = fields.filter((f) => !["button", "attachment", "json"].includes(f.type));
  return (
    <div className="stack tight">
      {sorts.map((s, i) => (
        <div key={i} className="inline-form">
          <select className="input small" aria-label="Sort by" value={s.field} onChange={(e) => onChange(sorts.map((x, k) => (k === i ? { ...x, field: Number(e.target.value) } : x)))}>
            {usable.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <Chips label="Direction" value={s.dir} onChange={(dir) => onChange(sorts.map((x, k) => (k === i ? { ...x, dir } : x)))} options={[{ value: "asc", label: "A → Z" }, { value: "desc", label: "Z → A" }]} />
          <IconButton icon={faTrash} label="Remove the sort" onClick={() => onChange(sorts.filter((_, k) => k !== i))} />
        </div>
      ))}
      {usable.length > 0 && (
        <div>
          <Button small variant="ghost" icon={faPlus} onClick={() => onChange([...sorts, { field: usable[0]!.id, dir: "asc" }])}>Add a sort</Button>
        </div>
      )}
    </div>
  );
}

export function FieldsChooser({ fields, hidden, onChange }: { fields: RegField[]; hidden: number[]; onChange: (hidden: number[]) => void }) {
  return (
    <div className="checks">
      {fields.map((f) => (
        <label key={f.id} className="checkbox">
          <input type="checkbox" checked={!hidden.includes(f.id)} onChange={(e) => onChange(e.target.checked ? hidden.filter((id) => id !== f.id) : [...hidden, f.id])} />
          {f.name}
        </label>
      ))}
    </div>
  );
}

/** The sort of a list as the API reads it: `-12,15` (field ids: names may hold commas). */
export const sortParam = (sorts: Sort[]) => sorts.map((s) => `${s.dir === "desc" ? "-" : ""}${s.field}`).join(",");
