import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { api } from "../api/client";
import type { ItemRow } from "../api/types";
import { HazardChecks, HazardPills } from "../components/HazardPills";
import { ItemThumb } from "../components/ItemThumb";
import { PriceSelector } from "../components/PriceSelector";
import { ReceiveForm } from "../components/ReceiveForm";
import { SearchSelect } from "../components/SearchSelect";
import { Card, Cards, DataTable, Field, MoneyCard, PageHeader, Panel, type Column } from "../components/ui";
import { useMe } from "../lib/auth";
import { money, moneyE4, quantity } from "../lib/format";
import { HAZARDS, useInventoryLookups } from "../lib/inventory";
import { usePrice } from "../lib/price";

const COLUMNS: Column<ItemRow>[] = [
  { key: "picture", header: "", cell: (r) => <ItemThumb id={r.id} hasImage={r.hasImage} name={r.name} /> },
  {
    key: "name",
    header: "ITEM",
    sort: (r) => r.name,
    cell: (r) => (
      <>
        <Link to={`/inventory/items/${r.id}`} className="item-link">{r.name}</Link>
        {r.origin === "made" && <span className="pill teal">made</span>}
        {r.code && <div className="muted">{r.code}</div>}
      </>
    ),
  },
  { key: "category", header: "CATEGORY", sort: (r) => r.category, cell: (r) => r.category ?? <span className="muted">—</span> },
  {
    key: "hazards",
    header: "HAZARDS",
    sort: (r) => HAZARDS.filter((h) => r[h.key]).length || null,
    cell: (r) => (HAZARDS.some((h) => r[h.key]) ? <HazardPills item={r} /> : <span className="muted">—</span>),
  },
  { key: "onHand", header: "ON THE SHELF", num: true, sort: (r) => r.onHandMilli, cell: (r) => `${quantity(r.onHandMilli)} ${r.unit}` },
  {
    key: "bought",
    header: "BOUGHT",
    num: true,
    sort: (r) => (r.origin === "made" ? null : r.boughtMilli),
    cell: (r) => (r.origin === "made" ? <span className="muted">—</span> : `${quantity(r.boughtMilli)} ${r.unit}`),
  },
  {
    key: "unit",
    header: "UNIT PRICE",
    num: true,
    sort: (r) => r.unitE4,
    cell: (r) => (
      <>
        {r.unitE4 === null ? <span className="muted" title="Never bought">—</span> : moneyE4(r.unitE4)}
        {!r.complete && r.unitE4 !== null && <span className="negative" title="Something in its cost has never been bought"> !</span>}
      </>
    ),
  },
  {
    key: "value",
    header: "VALUE",
    num: true,
    className: "sum",
    sort: (r) => r.valueCents,
    cell: (r) => (r.valueCents === null ? <span className="muted">—</span> : money(r.valueCents)),
  },
  { key: "where", header: "WHERE", sort: (r) => r.places.join(", ") || null, cell: (r) => (r.places.length ? r.places.join(", ") : <span className="muted">—</span>) },
];

/** INVENTORY: everything the team keeps, how much of it, where, and what it is worth. */
export function InventoryPage() {
  const canEdit = useMe().permissions.canManageInventory;
  const [price, setPrice] = usePrice();
  const lookups = useInventoryLookups();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [origin, setOrigin] = useState("");
  const [location, setLocation] = useState("");
  const [hazards, setHazards] = useState({ flammable: false, toxic: false, carcinogenic: false });

  const filters = {
    search: search.trim() || undefined, category: category || undefined, origin: origin || undefined, location: location || undefined,
    // each one ticked narrows the list to the items that are so
    ...Object.fromEntries(HAZARDS.filter((h) => hazards[h.key]).map((h) => [h.key, "true"])),
  };
  const items = useQuery({ queryKey: ["inventory-items", price, filters], queryFn: () => api.inventoryItems(price, filters) });
  const everything = useQuery({ queryKey: ["inventory-items", price, {}], queryFn: () => api.inventoryItems(price) });

  const rows = items.data ?? [];
  const value = rows.reduce((sum, r) => sum + (r.valueCents ?? 0), 0);

  return (
    <>
      <PageHeader
        title="INVENTORY"
        description="What the team keeps: how much, where, what it cost and what it is for. Goods bought with the budget are added from PENDING when they arrive."
        add={
          canEdit && lookups
            ? {
                label: "Add goods",
                form: (close) =>
                  everything.data && (
                    <Panel title="Add goods that were not in the budget">
                      <ReceiveForm items={everything.data} lookups={lookups} onDone={close} onCancel={close} />
                    </Panel>
                  ),
              }
            : undefined
        }
      />

      <Cards>
        <Card caption="Items shown">{rows.length}</Card>
        <MoneyCard caption="Value on the shelf" cents={value} />
      </Cards>

      <Panel>
        <section className="filter-group" aria-label="What to find">
          <div className="filter-title">Find</div>
          <div className="inline-form">
            <Field label="Search" htmlFor="inventory-search" className="grow">
              <input id="inventory-search" className="input small" placeholder="Name, code, what it is for…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </Field>
            <Field label="Category" htmlFor="inventory-category">
              <SearchSelect id="inventory-category" value={category} onChange={setCategory} choices={[{ value: "", label: "All" }, ...(lookups?.categories ?? []).map((c) => ({ value: c, label: c }))]} />
            </Field>
            <Field label="Kind" htmlFor="inventory-origin">
              <select id="inventory-origin" className="input small" value={origin} onChange={(e) => setOrigin(e.target.value)}>
                <option value="">Bought and made</option>
                <option value="bought">Bought</option>
                <option value="made">Made by the team</option>
              </select>
            </Field>
            <Field label="Where" htmlFor="inventory-location">
              <SearchSelect id="inventory-location" value={location} onChange={setLocation} choices={[{ value: "", label: "Anywhere" }, ...(lookups?.locations ?? []).map((l) => ({ value: l.code, label: l.label }))]} />
            </Field>
            <HazardChecks value={hazards} onChange={(key, checked) => setHazards({ ...hazards, [key]: checked })} />
          </div>
        </section>
        <section className="filter-group" aria-label="Which price">
          <div className="filter-title">Prices</div>
          <PriceSelector value={price} onChange={setPrice} date />
        </section>

        <DataTable title="Inventory" columns={COLUMNS} rows={items.data} rowKey={(r) => r.id} empty="Nothing here yet" />
      </Panel>
    </>
  );
}
