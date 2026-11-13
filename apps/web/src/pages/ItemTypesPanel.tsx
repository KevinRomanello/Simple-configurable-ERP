import { faTrash, faXmark } from "@fortawesome/free-solid-svg-icons";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { api } from "../api/client";
import type { Area, ItemType, ParamKind, TypeParam } from "../api/types";
import { Button, IconButton } from "../components/Button";
import { CommitInput } from "../components/CommitInput";
import { DeleteButton, OrderButtons } from "../components/ListButtons";
import { AddSection, DataTable, Field, FormPanel, Loading, Panel, type Column } from "../components/ui";
import { useAction } from "../lib/useAction";

// The types of the inventory on the Settings page (admins and project managers): a type (Resistor),
// its area, whether its items are asked the hazards, and its parameters. docs/inventario.md, §19.

const KINDS: { value: ParamKind; label: string }[] = [
  { value: "number", label: "Number" },
  { value: "list", label: "List" },
  { value: "text", label: "Text" },
  { value: "yesno", label: "Yes / no" },
];

const paramLabel = (p: TypeParam) => (p.unit ? `${p.name} (${p.unit})` : p.name);

/** The area of a type: one of the areas, or every area. */
function AreaSelect({ id, value, areas, label, onChange }: { id?: string; value: number | null; areas: Area[]; label?: string; onChange: (areaId: number | null) => void }) {
  return (
    <select id={id} className="input small" aria-label={label} value={value === null ? "" : String(value)} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}>
      <option value="">Every area</option>
      {areas.map((a) => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
    </select>
  );
}

/** A category of the budget, as Settings lists them. */
type BudgetCategory = { id: number; name: string };

/** The category of the budget a type is linked to; `unlinked` is the empty choice of a type made before this was asked. */
function CategorySelect({ id, value, categories, label, onChange }: { id?: string; value: number | null; categories: BudgetCategory[]; label?: string; onChange: (categoryId: number) => void }) {
  return (
    <select id={id} className={`input small${value === null ? " needs-choice" : ""}`} aria-label={label} value={value === null ? "" : String(value)} onChange={(e) => e.target.value !== "" && onChange(Number(e.target.value))}>
      {value === null && <option value="">Choose…</option>}
      {categories.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
    </select>
  );
}

export function ItemTypesPanel({ categories }: { categories: BudgetCategory[] }) {
  const act = useAction();
  const types = useQuery({ queryKey: ["item-types"], queryFn: api.itemTypes });
  const areas = useQuery({ queryKey: ["areas"], queryFn: api.areas });
  const [open, setOpen] = useState<number | null>(null);
  /** The type a new sub-type is being made under. */
  const [under, setUnder] = useState<number | null>(null);
  if (!types.data || !areas.data) return <Panel title="Item types"><Loading /></Panel>;
  // the derived area has no items and nobody is assigned to it
  const allAreas = areas.data.filter((a) => !a.derived);
  const areaName = (areaId: number | null) => allAreas.find((a) => a.id === areaId)?.name ?? "Every area";

  const columns: Column<ItemType>[] = [
    {
      key: "name",
      header: "TYPE",
      cell: (t) => (
        <div className="type-name" style={{ paddingLeft: `calc(var(--space-l) * ${t.depth})` }}>
          <CommitInput wide value={t.name} label={`Name of ${t.path}`} onCommit={(name) => name !== "" && act(() => api.updateType(t.id, { name }))} />
        </div>
      ),
    },
    {
      key: "parent",
      header: "UNDER",
      cell: (t) => (
        <select className="input small" aria-label={`Where ${t.path} is`} value={t.parentId === null ? "" : String(t.parentId)} onChange={(e) => act(() => api.updateType(t.id, { parentId: e.target.value === "" ? null : Number(e.target.value) }))}>
          <option value="">(a type of its own)</option>
          {types.data.filter((o) => o.id !== t.id && !isUnder(o, t.id)).map((o) => <option key={o.id} value={String(o.id)}>{o.path}</option>)}
        </select>
      ),
    },
    {
      key: "area",
      header: "AREA",
      sort: (t) => areaName(t.areaId),
      cell: (t) => <AreaSelect value={t.areaId} areas={allAreas} label={`Area of ${t.name}`} onChange={(areaId) => act(() => api.updateType(t.id, { areaId }))} />,
    },
    {
      key: "category",
      header: "BUDGET CATEGORY",
      sort: (t) => t.category,
      cell: (t) => <CategorySelect value={t.categoryId} categories={categories} label={`Budget category of ${t.name}`} onChange={(categoryId) => act(() => api.updateType(t.id, { categoryId }))} />,
    },
    {
      key: "hazards",
      header: "ASKS FLAMMABLE, TOXIC, CARCINOGENIC",
      cell: (t) => <input type="checkbox" aria-label={`${t.name}: asks flammable, toxic, carcinogenic`} checked={t.hazards} onChange={(e) => act(() => api.updateType(t.id, { hazards: e.target.checked }))} />,
    },
    { key: "params", header: "WHAT IS WRITTEN ABOUT IT", cell: (t) => (t.params.length ? t.params.map(paramLabel).join(" · ") : <span className="muted">nothing yet</span>) },
    { key: "items", header: "ITEMS", num: true, sort: (t) => t.items, cell: (t) => t.items || "" },
    { key: "open", header: "", cell: (t) => <Button small variant="ghost" onClick={() => setOpen(open === t.id ? null : t.id)}>{open === t.id ? "Close" : "Parameters"}</Button> },
    { key: "sub", header: "", cell: (t) => <Button small variant="ghost" onClick={() => setUnder(under === t.id ? null : t.id)}>{under === t.id ? "Close" : "Add sub-type"}</Button> },
    { key: "delete", header: "", num: true, cell: (t) => <DeleteButton label={t.name} usedBy={t.items} onDelete={() => act(() => api.deleteType(t.id))} /> },
  ];
  const opened = types.data.find((t) => t.id === open);
  const parentOfNew = types.data.find((t) => t.id === under);
  /** Whether a type is somewhere under the type `id` (so `id` cannot go under it). */
  const isUnder = (type: ItemType, id: number): boolean => {
    for (let t: ItemType | undefined = type; t !== undefined; t = types.data.find((o) => o.id === t!.parentId)) if (t.parentId === id) return true;
    return false;
  };
  const unlinked = types.data.filter((t) => t.categoryId === null).length;

  return (
    <Panel title="Item types">
      <p className="muted">
        The kinds of things each area keeps (Resistor, Capacitor, Screw…) and what is written about each item of them: a number with its unit
        (10k, 100n with k, M, m, µ…), one of a list, a text, a yes or no. Admins and users keep them; everybody sees them in the
        inventory, where they filter the list. A type of no area is offered to every area.
      </p>
      <p className="muted">
        A type can be a <strong>kind of another</strong> (Op-amp under IC): <em>Add sub-type</em> makes one, and <em>Under</em> moves one. A sub-type has
        everything written about its parents, and its own on top; choosing IC in the inventory shows the op-amps too. Types under the same
        parent have different names; a parameter is written once along a line.
      </p>
      <p className="muted">
        Every type is linked to a <strong>category of the budget</strong>: its items take it from there (it is not asked on the item), and the
        statistics by category and the optional fields of the form follow it. Changing it changes it for all the items of the type.
        {unlinked > 0 && <> <strong>{unlinked} {unlinked === 1 ? "type has" : "types have"} none yet</strong>: their items keep the category they have until you choose.</>}
      </p>
      {parentOfNew && <NewType key={parentOfNew.id} parent={parentOfNew} areas={allAreas} categories={categories} onDone={(id) => { setUnder(null); if (id !== null) setOpen(id); }} />}
      <DataTable title="Item types" columns={columns} rows={types.data} rowKey={(t) => t.id} empty="No types yet" />
      {opened && <ParamsPanel type={opened} types={types.data} />}
      <AddSection label="New type" form={(close) => <NewType areas={allAreas} categories={categories} onDone={(id) => { close(); if (id !== null) setOpen(id); }} />} />
    </Panel>
  );
}

/** A new type, of its own or (with `parent`) a kind of another, which starts from the area, the category and the hazards of its parent. */
function NewType({ parent, areas, categories, onDone }: { parent?: ItemType; areas: Area[]; categories: BudgetCategory[]; onDone: (id: number | null) => void }) {
  const act = useAction();
  const [name, setName] = useState("");
  const [areaId, setAreaId] = useState<number | null>(parent?.areaId ?? null);
  const [categoryId, setCategoryId] = useState<number | null>(parent?.categoryId ?? null);
  const [hazards, setHazards] = useState(parent?.hazards ?? true);
  const submit = async () => {
    let createdId: number | null = null;
    // the new type opens at once, ready for its parameters
    if (await act(async () => { createdId = (await api.createType({ name: name.trim(), areaId, hazards, categoryId: categoryId!, ...(parent ? { parentId: parent.id } : {}) })).id; })) onDone(createdId);
  };
  return (
    <FormPanel title={parent ? `New sub-type of ${parent.path}` : "New type"} submitLabel="Add type" canSubmit={name.trim() !== "" && categoryId !== null} onSubmit={submit} onCancel={() => onDone(null)}>
      <Field label="Name" htmlFor="new-type-name">
        <input id="new-type-name" className="input small" maxLength={100} autoFocus placeholder="Resistor" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Area" htmlFor="new-type-area">
        <AreaSelect id="new-type-area" value={areaId} areas={areas} onChange={setAreaId} />
      </Field>
      <Field label="Budget category" htmlFor="new-type-category">
        <CategorySelect id="new-type-category" value={categoryId} categories={categories} onChange={setCategoryId} />
      </Field>
      <label className="checkbox">
        <input type="checkbox" checked={hazards} onChange={(e) => setHazards(e.target.checked)} />
        Ask flammable, toxic, carcinogenic
      </label>
    </FormPanel>
  );
}

/** The parameters of one type, each changed where it is shown. */
function ParamsPanel({ type, types }: { type: ItemType; types: ItemType[] }) {
  const act = useAction();
  // the order is that of the type's own parameters; the ones of its parents come first and are changed on the parent
  const ids = type.params.filter((p) => !p.inherited).map((p) => p.id);
  const ownerName = (p: TypeParam) => types.find((t) => t.id === p.typeId)?.name ?? "a parent";
  const parentOnly = (p: TypeParam, what: ReactNode) => (p.inherited ? <span className="muted">{what}</span> : null);
  const remove = (p: TypeParam) => {
    const lost = p.filledIn > 0 ? ` What is written in it for ${p.filledIn} items goes with it (the History keeps it).` : "";
    if (window.confirm(`Delete "${p.name}" from ${type.name}?${lost}`)) void act(() => api.deleteParam(p.id));
  };
  const columns: Column<TypeParam>[] = [
    { key: "order", header: "ORDER", cell: (p) => (p.inherited ? null : <OrderButtons ids={ids} index={ids.indexOf(p.id)} label={p.name} onOrder={(order) => act(() => api.orderParams(type.id, order))} />) },
    {
      key: "name",
      header: "PARAMETER",
      cell: (p) =>
        p.inherited ? (
          <span>{p.name} <span className="muted">(from {ownerName(p)})</span></span>
        ) : (
          <CommitInput wide value={p.name} label={`Name of ${p.name}`} onCommit={(name) => name !== "" && act(() => api.updateParam(p.id, { name }))} />
        ),
    },
    {
      key: "kind",
      header: "KIND",
      cell: (p) => parentOnly(p, KINDS.find((k) => k.value === p.kind)?.label) ?? (
        <span title={p.filledIn > 0 ? "Something is written in it: its kind cannot change" : undefined}>
          <select className="input small" aria-label={`Kind of ${p.name}`} value={p.kind} disabled={p.filledIn > 0} onChange={(e) => act(() => api.updateParam(p.id, { kind: e.target.value as ParamKind }))}>
            {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </span>
      ),
    },
    {
      key: "unit",
      header: "UNIT",
      cell: (p) => parentOnly(p, p.kind === "number" ? (p.unit ?? "") : "—") ?? (p.kind === "number" ? <CommitInput value={p.unit ?? ""} label={`Unit of ${p.name}`} onCommit={(unit) => act(() => api.updateParam(p.id, { unit }))} /> : <span className="muted">—</span>),
    },
    {
      key: "prefixes",
      header: "k, M, m, µ…",
      cell: (p) => parentOnly(p, p.kind === "number" ? (p.prefixes ? "yes" : "no") : "—") ?? (p.kind === "number" ? <input type="checkbox" aria-label={`${p.name} is written with k, M, m, µ`} checked={p.prefixes} onChange={(e) => act(() => api.updateParam(p.id, { prefixes: e.target.checked }))} /> : <span className="muted">—</span>),
    },
    { key: "choices", header: "CHOICES", cell: (p) => parentOnly(p, p.kind === "list" ? p.choices.join(", ") : "—") ?? (p.kind === "list" ? <Choices param={p} /> : <span className="muted">—</span>) },
    { key: "filledIn", header: "FILLED IN", num: true, cell: (p) => p.filledIn || "" },
    { key: "delete", header: "", num: true, cell: (p) => (p.inherited ? null : <IconButton icon={faTrash} label={`Delete ${p.name}`} danger onClick={() => remove(p)} />) },
  ];
  return (
    <Panel title={`What is written about each ${type.name}`}>
      {type.params.some((p) => p.inherited) && <p className="muted">The ones that come from a parent are changed on the parent: its sub-types follow.</p>}
      <p className="muted">
        Renaming is always possible. The kind changes only while nothing is written in it. Changing the unit does not convert what is
        written: 10 stays 10. A choice that items have can be renamed (they follow), not taken away.
      </p>
      <DataTable title={`Parameters of ${type.name}`} columns={columns} rows={type.params} rowKey={(p) => p.id} empty="Nothing yet: add the first parameter" />
      <AddSection label="Add parameter" form={(close) => <NewParam typeId={type.id} onDone={close} />} />
    </Panel>
  );
}

/** The choices of a list: each one renamed in its box, taken away with its ×, new ones typed at the end ("0402, 0603" adds two). */
function Choices({ param }: { param: TypeParam }) {
  const act = useAction();
  const [adding, setAdding] = useState("");
  const current = param.choices.map((c) => ({ was: c, name: c }));
  const save = (next: { was?: string; name: string }[]) => act(() => api.updateParam(param.id, { choices: next }));
  const add = async () => {
    const names = adding.split(",").map((c) => c.trim()).filter((c) => c !== "");
    if (names.length > 0 && (await save([...current, ...names.map((name) => ({ name }))]))) setAdding("");
  };
  return (
    <div className="choices">
      {param.choices.map((c, i) => (
        <span key={c} className="icon-row">
          <CommitInput value={c} label={`Choice ${c} of ${param.name}`} onCommit={(name) => name !== "" && save(current.map((x, j) => (j === i ? { was: c, name } : x)))} />
          <IconButton icon={faXmark} label={`Take away ${c}`} onClick={() => save(current.filter((_, j) => j !== i))} />
        </span>
      ))}
      <input className="input small" aria-label={`New choice of ${param.name}`} placeholder="Add…" maxLength={500} value={adding}
        onChange={(e) => setAdding(e.target.value)} onBlur={add} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
    </div>
  );
}

function NewParam({ typeId, onDone }: { typeId: number; onDone: () => void }) {
  const act = useAction();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ParamKind>("number");
  const [unit, setUnit] = useState("");
  const [prefixes, setPrefixes] = useState(true);
  const [choices, setChoices] = useState("");
  const submit = async () => {
    const body = {
      name: name.trim(),
      kind,
      ...(kind === "number" ? { unit: unit.trim() === "" ? null : unit.trim(), prefixes } : {}),
      ...(kind === "list" ? { choices: choices.split(",").map((c) => c.trim()).filter((c) => c !== "") } : {}),
    };
    if (await act(() => api.addParam(typeId, body))) onDone();
  };
  return (
    <FormPanel title="Add parameter" submitLabel="Add parameter" canSubmit={name.trim() !== ""} onSubmit={submit} onCancel={onDone}>
      <Field label="Name" htmlFor="new-param-name">
        <input id="new-param-name" className="input small" maxLength={100} autoFocus placeholder="Resistance" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Kind" htmlFor="new-param-kind">
        <select id="new-param-kind" className="input small" value={kind} onChange={(e) => setKind(e.target.value as ParamKind)}>
          {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </select>
      </Field>
      {kind === "number" && (
        <>
          <Field label="Unit" htmlFor="new-param-unit">
            <input id="new-param-unit" className="input small" maxLength={20} placeholder="Ω" value={unit} onChange={(e) => setUnit(e.target.value)} />
          </Field>
          <label className="checkbox">
            <input type="checkbox" checked={prefixes} onChange={(e) => setPrefixes(e.target.checked)} />
            Written with k, M, m, µ…
          </label>
        </>
      )}
      {kind === "list" && (
        <Field label="Choices, separated by commas" htmlFor="new-param-choices">
          <input id="new-param-choices" className="input small" maxLength={2000} placeholder="0402, 0603, 0805" value={choices} onChange={(e) => setChoices(e.target.value)} />
        </Field>
      )}
    </FormPanel>
  );
}
