import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { api } from "../api/client";
import { Button } from "../components/Button";
import { PriceSelector } from "../components/PriceSelector";
import { useMe } from "../lib/auth";
import { moneyE4, quantity } from "../lib/format";
import { useInventoryLookups } from "../lib/inventory";
import { usePrice } from "../lib/price";
import { useAction } from "../lib/useAction";

/** COMPONENTS: what the team makes, from what, and what one costs at the prices paid. */
export function ComponentsPage() {
  const navigate = useNavigate();
  const act = useAction();
  const canEdit = useMe().permissions.canManageInventory;
  const lookups = useInventoryLookups();
  const [price, setPrice] = usePrice();
  const components = useQuery({ queryKey: ["inventory-components", price], queryFn: () => api.components(price) });
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");

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
        {canEdit && lookups && (
          <form className="inline-form" onSubmit={create}>
            <div className="field">
              <label htmlFor="component-name">New component</label>
              <input id="component-name" className="input small" maxLength={200} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="component-purpose">What it is for</label>
              <input id="component-purpose" className="input small" placeholder="Optional" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
            </div>
            <Button small icon={faPlus} type="submit" disabled={name.trim() === ""}>Add component</Button>
          </form>
        )}
      </header>

      <section className="panel">
        <PriceSelector value={price} onChange={setPrice} date />

        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>COMPONENT</th><th className="num">PARTS</th><th className="num">COST OF ONE</th><th className="num">ON THE SHELF</th></tr></thead>
            <tbody>
              {components.data?.map((c) => (
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
        </div>
      </section>
    </>
  );
}
