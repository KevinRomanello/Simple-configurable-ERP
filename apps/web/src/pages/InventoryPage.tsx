import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { api } from "../api/client";
import { Button } from "../components/Button";
import { ItemThumb } from "../components/ItemThumb";
import { PriceSelector } from "../components/PriceSelector";
import { ReceiveForm } from "../components/ReceiveForm";
import { MoneyCard } from "../components/Cards";
import { useMe } from "../lib/auth";
import { moneyE4, money, quantity } from "../lib/format";
import { useInventoryLookups } from "../lib/inventory";
import { usePrice } from "../lib/price";

/** INVENTORY: everything the team keeps, how much of it, where, and what it is worth. */
export function InventoryPage() {
  const canEdit = useMe().permissions.canManageInventory;
  const [price, setPrice] = usePrice();
  const lookups = useInventoryLookups();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [origin, setOrigin] = useState("");
  const [location, setLocation] = useState("");
  const [adding, setAdding] = useState(false);

  const filters = { search: search.trim() || undefined, category: category || undefined, origin: origin || undefined, location: location || undefined };
  const items = useQuery({ queryKey: ["inventory-items", price, filters], queryFn: () => api.inventoryItems(price, filters) });
  const everything = useQuery({ queryKey: ["inventory-items", price, {}], queryFn: () => api.inventoryItems(price) });

  const rows = items.data ?? [];
  const value = rows.reduce((sum, r) => sum + (r.valueCents ?? 0), 0);

  return (
    <>
      <header className="page-header">
        <div>
          <h1>INVENTORY</h1>
          <p className="muted">What the team keeps: how much, where, what it cost and what it is for. Goods bought with the budget are added from PENDING when they arrive.</p>
        </div>
        {canEdit && lookups && <Button small icon={faPlus} onClick={() => setAdding(!adding)}>{adding ? "Close" : "Add goods"}</Button>}
      </header>

      {adding && lookups && everything.data && (
        <section className="panel">
          <h2>Add goods that were not in the budget</h2>
          <ReceiveForm items={everything.data} lookups={lookups} onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
        </section>
      )}

      <div className="cards">
        <div className="card"><span className="label-s sub">Items shown</span><span className="value">{rows.length}</span></div>
        <MoneyCard caption="Value on the shelf" cents={value} />
      </div>

      <div className="inline-form">
        <div className="field">
          <label htmlFor="inventory-search">Search</label>
          <input id="inventory-search" className="input small" placeholder="Name, code, what it is for…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="inventory-category">Category</label>
          <select id="inventory-category" className="input small" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All</option>
            {lookups?.categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="inventory-origin">Kind</label>
          <select id="inventory-origin" className="input small" value={origin} onChange={(e) => setOrigin(e.target.value)}>
            <option value="">Bought and made</option>
            <option value="bought">Bought</option>
            <option value="made">Made by the team</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="inventory-location">Where</label>
          <select id="inventory-location" className="input small" value={location} onChange={(e) => setLocation(e.target.value)}>
            <option value="">Anywhere</option>
            {lookups?.locations.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </div>
        <PriceSelector value={price} onChange={setPrice} date />
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th />
              <th>ITEM</th>
              <th>CATEGORY</th>
              <th className="num">ON THE SHELF</th>
              <th className="num">BOUGHT</th>
              <th className="num">UNIT PRICE</th>
              <th className="num">VALUE</th>
              <th>WHERE</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><ItemThumb id={r.id} hasImage={r.hasImage} name={r.name} /></td>
                <td>
                  <Link to={`/inventory/items/${r.id}`} className="item-link">{r.name}</Link>
                  {r.origin === "made" && <span className="pill teal">made</span>}
                  {r.code && <div className="muted">{r.code}</div>}
                </td>
                <td>{r.category ?? <span className="muted">—</span>}</td>
                <td className="num">{quantity(r.onHandMilli)} {r.unit}</td>
                <td className="num">{r.origin === "made" ? <span className="muted">—</span> : `${quantity(r.boughtMilli)} ${r.unit}`}</td>
                <td className="num">
                  {r.unitE4 === null ? <span className="muted" title="Never bought">—</span> : moneyE4(r.unitE4)}
                  {!r.complete && r.unitE4 !== null && <span className="negative" title="Something in its cost has never been bought"> !</span>}
                </td>
                <td className="num">{r.valueCents === null ? <span className="muted">—</span> : money(r.valueCents)}</td>
                <td>{r.places.length ? r.places.join(", ") : <span className="muted">—</span>}</td>
              </tr>
            ))}
            {items.isSuccess && rows.length === 0 && <tr><td colSpan={8} className="empty">Nothing here yet</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
