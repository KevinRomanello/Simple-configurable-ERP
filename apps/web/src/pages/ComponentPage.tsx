import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { api } from "../api/client";
import type { BomLine } from "../api/types";
import { Button, IconButton } from "../components/Button";
import { SearchSelect } from "../components/SearchSelect";
import { ItemThumb } from "../components/ItemThumb";
import { LineChart } from "../components/LineChart";
import { PriceSelector } from "../components/PriceSelector";
import { useMe } from "../lib/auth";
import { money, moneyE4, monthOfDate, quantity } from "../lib/format";
import { usePrice } from "../lib/price";
import { useAction } from "../lib/useAction";
import { TableBox } from "../components/ExportBlocks";
import { DownloadMenu } from "../components/DownloadMenu";
import { SortTh } from "../components/SortTh";
import { useSort, type SortAccessors } from "../lib/sort";

const SORT: SortAccessors<BomLine> = {
  part: (l) => l.name,
  quantity: (l) => l.quantityMilli,
  unit: (l) => l.unitE4,
  cost: (l) => l.totalCents,
};

/** One thing the team makes: its parts with their prices, the cost of one and how the cost changed. */
export function ComponentPage() {
  const componentId = Number(useParams().id);
  const act = useAction();
  const canEdit = useMe().permissions.canManageInventory;
  const [price, setPrice] = usePrice();
  const detail = useQuery({ queryKey: ["inventory-component", componentId, price], queryFn: () => api.component(componentId, price) });
  const items = useQuery({ queryKey: ["inventory-items", price, {}], queryFn: () => api.inventoryItems(price) });
  const [partId, setPartId] = useState("");
  const [amount, setAmount] = useState("1");
  const [note, setNote] = useState("");
  const sort = useSort(SORT);

  if (detail.isError) return <p className="empty">This is not something the team makes, or it does not exist.</p>;
  if (!detail.data) return <p className="empty">Loading…</p>;
  const { item, bom, series, notes } = detail.data;
  const taken = new Set(bom.lines.map((l) => l.partId));
  const candidates = (items.data ?? []).filter((i) => i.id !== componentId && !taken.has(i.id));
  const hasPicture = (items.data ?? []).find((i) => i.id === componentId)?.hasImage ?? false;

  const add = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await act(() => api.addPart(componentId, { partId: Number(partId), quantity: amount, ...(note.trim() ? { note: note.trim() } : {}) }));
    if (ok) {
      setPartId("");
      setAmount("1");
      setNote("");
    }
  };

  return (
    <>
      <header className="item-head">
        <ItemThumb id={item.id} hasImage={hasPicture} size="full" name={item.name} />
        <div className="item-title">
          <h1>{item.name}</h1>
          <p className="muted">{item.purpose ?? "Made by the team"} · <Link to={`/inventory/items/${item.id}`} className="item-link">open the item</Link></p>
        </div>
        <DownloadMenu />
      </header>

      <PriceSelector value={price} onChange={setPrice} date />
      <div className="cards">
        <div className="card">
          <span className="label-s sub">Cost of one</span>
          <span className="value">{bom.unitE4 === null ? "—" : moneyE4(bom.unitE4)}</span>
          {!bom.complete && <span className="hint error">Some parts have never been bought: the cost is missing them</span>}
        </div>
        <div className="card"><span className="label-s sub">Parts</span><span className="value">{bom.lines.length}</span></div>
        <div className="card"><span className="label-s sub">Sum of the lines</span><span className="value">{bom.totalCents === null ? "—" : money(bom.totalCents)}</span></div>
      </div>

      <LineChart title="Cost of one, at the end of each month" data={series.map((p) => ({ label: monthOfDate(p.on), e4: p.unitE4 }))} />

      <section className="panel">
        <h2>Made of</h2>
        <TableBox title="Made of">
          <table className="data-table">
            <thead>
              <tr>
                <SortTh sort={sort} by="part">PART</SortTh>
                <SortTh sort={sort} by="quantity" className="num">QUANTITY IN ONE</SortTh>
                <SortTh sort={sort} by="unit" className="num">UNIT PRICE</SortTh>
                <SortTh sort={sort} by="cost" className="num">COST</SortTh>
                <th>NOTE</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sort.sorted(bom.lines).map((l) => (
                <tr key={l.partId}>
                  <td>
                    <Link to={l.origin === "made" ? `/inventory/components/${l.partId}` : `/inventory/items/${l.partId}`} className="item-link">{l.name}</Link>
                    {l.origin === "made" && <span className="pill teal">made</span>}
                  </td>
                  <td className="num">
                    {canEdit ? (
                      <input
                        className="input small qty" type="number" min="0" step="0.001" defaultValue={l.quantityMilli / 1000} aria-label={`Quantity of ${l.name}`}
                        onBlur={(e) => { if (e.target.value !== "" && Number(e.target.value) * 1000 !== l.quantityMilli) void act(() => api.updatePart(componentId, l.partId, { quantity: e.target.value })); }}
                      />
                    ) : quantity(l.quantityMilli)} {l.unit}
                  </td>
                  <td className="num">{l.unitE4 === null ? <span className="muted">never bought</span> : moneyE4(l.unitE4)}{!l.complete && l.unitE4 !== null && <span className="negative"> !</span>}</td>
                  <td className="num">{l.totalCents === null ? <span className="muted">—</span> : money(l.totalCents)}</td>
                  <td>{notes[l.partId] ?? ""}</td>
                  <td className="num">{canEdit && <IconButton icon={faTrash} label={`Remove ${l.name}`} danger onClick={() => act(() => api.removePart(componentId, l.partId))} />}</td>
                </tr>
              ))}
              {bom.lines.length === 0 && <tr><td colSpan={6} className="empty">No parts yet</td></tr>}
              {bom.totalCents !== null && <tr className="total"><td colSpan={3}>Total</td><td className="num">{money(bom.totalCents)}</td><td colSpan={2} /></tr>}
            </tbody>
          </table>
        </TableBox>
        {canEdit && (
          <form className="inline-form" onSubmit={add}>
            <div className="field">
              <label htmlFor="part-item">Add a part</label>
              <SearchSelect
                id="part-item"
                value={partId}
                onChange={setPartId}
                choices={[{ value: "", label: "Choose…" }, ...candidates.map((i) => ({ value: String(i.id), label: `${i.name}${i.origin === "made" ? " (made)" : ""}` }))]}
              />
            </div>
            <div className="field">
              <label htmlFor="part-quantity">Quantity in one</label>
              <input id="part-quantity" className="input small" type="number" min="0" step="0.001" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="part-note">Note</label>
              <input id="part-note" className="input small" maxLength={500} placeholder="Optional" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <Button small icon={faPlus} type="submit" disabled={partId === "" || amount === ""}>Add part</Button>
          </form>
        )}
      </section>
    </>
  );
}
