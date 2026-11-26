import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { api } from "../api/client";
import type { ComponentRow, ItemDraft } from "../api/types";
import { AreaTypeFields, useAreaTypeFilter } from "../components/AreaTypeFilter";
import { DraftNote } from "../components/DraftNote";
import { ItemEditor } from "../components/ItemEditor";
import { MakeDefaultsFields } from "../components/MakeDefaultsFields";
import { PriceSelector } from "../components/PriceSelector";
import { SearchSelect } from "../components/SearchSelect";
import { DataTable, Field, FormPanel, PageHeader, Panel, type Column } from "../components/ui";
import { useMe } from "../lib/auth";
import { moneyE4, quantity } from "../lib/format";
import { draftBody, emptyDraft, emptyMakeDefaults, makeDefaultsBody, paramErrors, useInventoryLookups, type InventoryLookups } from "../lib/inventory";
import { usePrice } from "../lib/price";
import { useAction } from "../lib/useAction";
import { useDraft } from "../lib/useDraft";

const COLUMNS: Column<ComponentRow>[] = [
  {
    key: "name",
    header: "COMPONENT",
    sort: (c) => c.name,
    cell: (c) => <Link to={`/inventory/components/${c.id}`} className="item-link">{c.name}</Link>,
  },
  { key: "parts", header: "PARTS", num: true, sort: (c) => c.partsCount, cell: (c) => c.partsCount },
  {
    key: "cost",
    header: "COST OF ONE",
    num: true,
    sort: (c) => c.unitE4,
    cell: (c) => (
      <>
        {c.unitE4 === null ? <span className="muted">no price yet</span> : moneyE4(c.unitE4)}
        {!c.complete && c.unitE4 !== null && <span className="negative" title="Something it is made of has never been bought"> !</span>}
      </>
    ),
  },
  { key: "onHand", header: "ON THE SHELF", num: true, sort: (c) => c.onHandMilli, cell: (c) => `${quantity(c.onHandMilli)} ${c.unit}` },
  {
    key: "canMake",
    header: "CAN MAKE",
    num: true,
    sort: (c) => (c.partsCount === 0 ? null : c.canMakeMilli),
    cellClass: (c) => (c.partsCount > 0 && c.canMakeMilli === 0 ? "cell-negative" : undefined),
    cell: (c) => (c.partsCount === 0 ? <span className="muted">no parts yet</span> : `${quantity(c.canMakeMilli)} ${c.unit}`),
  },
  {
    key: "limitedBy",
    header: "LIMITED BY",
    cell: (c) => (c.limitedBy.length > 0 ? c.limitedBy.join(", ") : <span className="muted">—</span>),
  },
];

/** COMPONENTS: what the team makes, from what, what one costs at the prices paid, and how many can be made with what is on the shelf. */
export function ComponentsPage() {
  const canEdit = useMe().permissions.canManageInventory;
  const lookups = useInventoryLookups();
  const [price, setPrice] = usePrice();
  const [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState("");
  const areaType = useAreaTypeFilter(lookups);
  const projects = useQuery({ queryKey: ["inventory-projects"], queryFn: api.inventoryProjects });
  const filters = { search: search.trim() || undefined, area: areaType.areaCode || undefined, type: areaType.type ? String(areaType.type.id) : undefined, project: projectId || undefined };
  const components = useQuery({ queryKey: ["inventory-components", price, filters], queryFn: () => api.components(price, filters) });
  const filtered = Object.values(filters).some((v) => v !== undefined);

  return (
    <>
      <PageHeader
        title="COMPONENTS"
        description="Things the team makes. Say what each is made of and the cost follows the prices paid for the materials; the list says how many can be made with what is on the shelf."
        add={canEdit && lookups ? { label: "New component", draftKey: "new-component", form: (close) => <NewComponent lookups={lookups} onDone={close} /> } : undefined}
      />
      <Panel>
        <PriceSelector value={price} onChange={setPrice} date />
        <section className="filter-group" aria-label="What to find">
          <div className="filter-title">Find</div>
          <div className="inline-form">
            <Field label="Search" htmlFor="components-search" className="grow">
              <input id="components-search" className="input small" placeholder="Name, code, what it is for…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </Field>
            <Field label="Project" htmlFor="components-project">
              <SearchSelect
                id="components-project"
                value={projectId}
                onChange={setProjectId}
                choices={[{ value: "", label: "All projects" }, ...(projects.data ?? []).map((p) => ({ value: String(p.id), label: `${p.areaName}: ${p.name}` }))]}
              />
            </Field>
          </div>
          <div className="inline-form">
            <AreaTypeFields filter={areaType} idPrefix="components" />
          </div>
        </section>
        <DataTable title="Components" columns={COLUMNS} rows={components.data} rowKey={(c) => c.id} empty={filtered ? "No component matches" : "No components yet"} />
      </Panel>
    </>
  );
}

/**
 * A new component is an item of the inventory like the others (name, code, area, type with its parameters, unit) that the
 * team makes, plus what «Make new» starts from. It opens its own page right away, to say what it is made of.
 */
function NewComponent({ lookups, onDone }: { lookups: InventoryLookups; onDone: () => void }) {
  const navigate = useNavigate();
  const act = useAction();
  // without a type it is a "Components" item of the budget; the type, when there is one, gives the category
  const [initial] = useState(() => ({ draft: { ...emptyDraft(), category: "Components" } as ItemDraft, make: emptyMakeDefaults() }));
  const [form, setForm, saved] = useDraft("new-component", initial);
  const { draft, make } = form;

  const create = async () => {
    let id = 0;
    const ok = await act(async () => {
      id = (await api.createItem({ ...draftBody(draft, lookups), ...makeDefaultsBody(make), origin: "made" })).id;
    });
    if (ok) {
      saved.discard();
      navigate(`/inventory/components/${id}`);
    }
  };

  return (
    <FormPanel
      title="New component"
      description="Say what it is, and where and for which project it is usually made: «Make new» starts from there. What it is made of comes next."
      submitLabel="Add component"
      canSubmit={draft.name.trim() !== "" && Object.keys(paramErrors(draft, lookups.types)).length === 0}
      onSubmit={create}
      onCancel={() => saved.leave(onDone)}
      layout="stack"
    >
      <DraftNote draft={saved} />
      <ItemEditor draft={draft} onChange={(change) => setForm((f) => ({ ...f, draft: { ...f.draft, ...change } }))} lookups={lookups} idPrefix="component" />
      <MakeDefaultsFields value={make} onChange={(change) => setForm((f) => ({ ...f, make: { ...f.make, ...change } }))} lookups={lookups} idPrefix="component-make" />
    </FormPanel>
  );
}
