import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { api } from "../api/client";
import type { ComponentRow } from "../api/types";
import { Button } from "../components/Button";
import { PriceSelector } from "../components/PriceSelector";
import { useMe } from "../lib/auth";
import { moneyE4, quantity } from "../lib/format";
import { useInventoryLookups } from "../lib/inventory";
import { usePrice } from "../lib/price";
import { useAction } from "../lib/useAction";
import { TableBox } from "../components/ExportBlocks";
import { DownloadMenu } from "../components/DownloadMenu";
import { SortTh } from "../components/SortTh";
import { useSort, type SortAccessors } from "../lib/sort";

const SORT: SortAccessors<ComponentRow> = {
  name: (c) => c.name,
  parts: (c) => c.partsCount,
  cost: (c) => c.unitE4,
  onHand: (c) => c.onHandMilli,
};

/** COMPONENTS: what the team makes, from what, and what one costs at the prices paid. */
export function ComponentsPage() {
  const navigate = useNavigate();
  const act = useAction();
  const canEdit = useMe().permissions.canManageInventory;
  const lookups = useInventoryLookups();
  const [price, setPrice] = usePrice();
  const sort = useSort(SORT);
  const components = useQuery({ queryKey: ["inventory-components", price], queryFn: () => api.components(price) });
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [adding, setAdding] = useState(false);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    let id = 0;
    const ok = await act(async () => {
      id = (await api.createItem({ name: name.trim(), purpose: purpose.trim() || null, category: "Components", unit: "pcs", origin: "made" })).id;
    });
    if (ok) navigate(`/inventory/components/${id}`);
  };

  return (
    <>
      <header className="page-header">
        <div>
          <h1>COMPONENTS</h1>
          <p className="muted">Things the team makes. Say what each is made of and the cost follows the prices paid for the materials, today or on any past day.</p>
        </div>
        <div className="actions">
          {canEdit && lookups && <Button icon={faPlus} onClick={() => setAdding(!adding)}>{adding ? "Close" : "New component"}</Button>}
          <DownloadMenu />
        </div>
      </header>

      {adding && (
        <section className="panel">
          <h2>New component</h2>
          <form className="inline-form" onSubmit={create}>
            <div className="field">
              <label htmlFor="component-name">Name</label>
              <input id="component-name" className="input small" maxLength={200} value={name} autoFocus onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="component-purpose">What it is for</label>
              <input id="component-purpose" className="input small" placeholder="Optional" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
            </div>
            <Button small icon={faPlus} type="submit" disabled={name.trim() === ""}>Add component</Button>
            <Button small variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </form>
        </section>
      )}

      <section className="panel">
        <PriceSelector value={price} onChange={setPrice} date />

        <TableBox title="Components">
          <table className="data-table">
            <thead><tr>
              <SortTh sort={sort} by="name">COMPONENT</SortTh>
              <SortTh sort={sort} by="parts" className="num">PARTS</SortTh>
              <SortTh sort={sort} by="cost" className="num">COST OF ONE</SortTh>
              <SortTh sort={sort} by="onHand" className="num">ON THE SHELF</SortTh>
            </tr></thead>
            <tbody>
              {sort.sorted(components.data ?? []).map((c) => (
                <tr key={c.id}>
                  <td><Link to={`/inventory/components/${c.id}`} className="item-link">{c.name}</Link></td>
                  <td className="num">{c.partsCount}</td>
                  <td className="num">
                    {c.unitE4 === null ? <span className="muted">no price yet</span> : moneyE4(c.unitE4)}
                    {!c.complete && c.unitE4 !== null && <span className="negative" title="Something it is made of has never been bought"> !</span>}
                  </td>
                  <td className="num">{quantity(c.onHandMilli)} {c.unit}</td>
                </tr>
              ))}
              {components.isSuccess && components.data.length === 0 && <tr><td colSpan={4} className="empty">No components yet</td></tr>}
            </tbody>
          </table>
        </TableBox>
      </section>
    </>
  );
}
