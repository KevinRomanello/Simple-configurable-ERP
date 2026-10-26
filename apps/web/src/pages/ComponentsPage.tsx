import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { api } from "../api/client";
import type { ComponentRow } from "../api/types";
import { PriceSelector } from "../components/PriceSelector";
import { DataTable, Field, FormPanel, PageHeader, Panel, type Column } from "../components/ui";
import { useMe } from "../lib/auth";
import { moneyE4, quantity } from "../lib/format";
import { useInventoryLookups } from "../lib/inventory";
import { usePrice } from "../lib/price";
import { useAction } from "../lib/useAction";

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
];

/** COMPONENTS: what the team makes, from what, and what one costs at the prices paid. */
export function ComponentsPage() {
  const canEdit = useMe().permissions.canManageInventory;
  const lookups = useInventoryLookups();
  const [price, setPrice] = usePrice();
  const components = useQuery({ queryKey: ["inventory-components", price], queryFn: () => api.components(price) });

  return (
    <>
      <PageHeader
        title="COMPONENTS"
        description="Things the team makes. Say what each is made of and the cost follows the prices paid for the materials, today or on any past day."
        add={canEdit && lookups ? { label: "New component", form: (close) => <NewComponent onDone={close} /> } : undefined}
      />
      <Panel>
        <PriceSelector value={price} onChange={setPrice} date />
        <DataTable title="Components" columns={COLUMNS} rows={components.data} rowKey={(c) => c.id} empty="No components yet" />
      </Panel>
    </>
  );
}

/** A new component opens its own page right away, to say what it is made of. */
function NewComponent({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const act = useAction();
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");

  const create = async () => {
    let id = 0;
    const ok = await act(async () => {
      id = (await api.createItem({ name: name.trim(), purpose: purpose.trim() || null, category: "Components", unit: "pcs", origin: "made" })).id;
    });
    if (ok) navigate(`/inventory/components/${id}`);
  };

  return (
    <FormPanel title="New component" submitLabel="Add component" canSubmit={name.trim() !== ""} onSubmit={create} onCancel={onDone}>
      <Field label="Name" htmlFor="component-name">
        <input id="component-name" className="input small" maxLength={200} value={name} autoFocus onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="What it is for" htmlFor="component-purpose">
        <input id="component-purpose" className="input small" placeholder="Optional" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
      </Field>
    </FormPanel>
  );
}
