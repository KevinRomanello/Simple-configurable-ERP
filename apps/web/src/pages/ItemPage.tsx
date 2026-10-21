import { faImage, faPen, faPlus, faTrash, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api } from "../api/client";
import type { ItemDraft, ItemField, MovementRow, StockPlace } from "../api/types";
import { Button, IconButton } from "../components/Button";
import { ItemEditor } from "../components/ItemEditor";
import { ItemThumb } from "../components/ItemThumb";
import { LineChart } from "../components/LineChart";
import { MovementForm } from "../components/MovementForm";
import { useNotify } from "../components/Notice";
import { PriceSelector } from "../components/PriceSelector";
import { ReceiveForm } from "../components/ReceiveForm";
import { useMe } from "../lib/auth";
import { date, money, moneyE4, quantity } from "../lib/format";
import { prepareImage } from "../lib/image";
import { draftBody, draftOf, FIELD_LABELS, useInventoryLookups } from "../lib/inventory";
import { usePrice } from "../lib/price";
import { useAction } from "../lib/useAction";

const KIND: Record<MovementRow["kind"], string> = { receipt: "Arrived", use: "Used", transfer: "Moved", adjustment: "Counted", disposal: "Disposed" };
const FIELD_ORDER: ItemField[] = ["purpose", "safetyCodes", "disposal", "storageNotes", "maintenanceNotes"];

/** The quantity of a movement as it reads on the shelf: arrivals add, uses and disposals take away. */
function movementQuantity(m: MovementRow): string {
  const milli = Math.round(Number(m.quantity) * 1000);
  if (m.kind === "use" || m.kind === "disposal") return `−${quantity(milli)}`;
  if (m.kind === "receipt") return `+${quantity(milli)}`;
  if (m.kind === "transfer") return `${quantity(milli)} → ${m.toLocation}${m.toSpot ? ` (${m.toSpot})` : ""}`;
  return milli > 0 ? `+${quantity(milli)}` : quantity(milli); // a count is the difference found
}

/** One item: its picture and information, where it is, what it cost over time and what happened to it. */
export function ItemPage() {
  const itemId = Number(useParams().id);
  const navigate = useNavigate();
  const act = useAction();
  const notify = useNotify();
  const canEdit = useMe().permissions.canManageInventory;
  const [price, setPrice] = usePrice();
  const lookups = useInventoryLookups();
  const detail = useQuery({ queryKey: ["inventory-item", itemId, price], queryFn: () => api.inventoryItem(itemId, price) });
  const items = useQuery({ queryKey: ["inventory-items", price, {}], queryFn: () => api.inventoryItems(price) });
  const [draft, setDraft] = useState<ItemDraft | null>(null);
  const [placeOpen, setPlaceOpen] = useState<string | null>(null);
  const [receiving, setReceiving] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  if (detail.isError) return <p className="empty">Item not found.</p>;
  if (!detail.data || !lookups) return <p className="empty">Loading…</p>;
  const { item, stock, history, movements, bom } = detail.data;
  const placeKey = (p: StockPlace) => `${p.location}\u0000${p.spot}`;

  const save = async () => {
    if (draft && (await act(() => api.updateItem(itemId, draftBody(draft, lookups.fields))))) setDraft(null);
  };
  const remove = async () => {
    if (window.confirm(`Delete "${item.name}"?`) && (await act(() => api.deleteItem(itemId)))) navigate("/inventory");
  };
  const pick = async (file: File | undefined) => {
    if (!file) return;
    try {
      const picture = await prepareImage(file);
      await act(() => api.setImage(itemId, picture));
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "The picture could not be read");
    }
  };

  const written = FIELD_ORDER.filter((f) => item[f]);

  return (
    <>
      <header className="item-head">
        <ItemThumb id={item.id} hasImage={detail.data.hasImage} size="full" name={item.name} />
        <div className="item-title">
          <h1>{item.name}</h1>
          <p className="muted">
            {item.category ?? "No category"} · counted in {item.unit}{item.code ? ` · code ${item.code}` : ""}
            {item.origin === "made" && <> · <span className="pill teal">made by the team</span></>}
          </p>
          {canEdit && (
            <div className="inline-form">
              <Button small variant="ghost" icon={faPen} onClick={() => setDraft(draft ? null : draftOf(item))}>{draft ? "Close" : "Edit"}</Button>
              <Button small variant="ghost" icon={faImage} onClick={() => picker.current?.click()}>{detail.data.hasImage ? "Change picture" : "Add picture"}</Button>
              {detail.data.hasImage && <Button small variant="ghost" onClick={() => act(() => api.removeImage(itemId))}>Remove picture</Button>}
              <IconButton icon={faTrash} label="Delete item" danger onClick={remove} />
              <input ref={picker} type="file" accept="image/*" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
            </div>
          )}
        </div>
      </header>

      {draft && (
        <section className="panel">
          <ItemEditor draft={draft} onChange={(change) => setDraft({ ...draft, ...change })} lookups={lookups} idPrefix="edit" />
          <div className="inline-form">
            <Button small onClick={save} disabled={draft.name.trim() === ""}>Save</Button>
            <Button small variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
          </div>
        </section>
      )}

      {!draft && written.length > 0 && (
        <dl className="facts">
          {written.map((field) => (
            <div key={field} className={field === "safetyCodes" ? "fact danger" : "fact"}>
              <dt className="label-s">{field === "safetyCodes" && <FontAwesomeIcon icon={faTriangleExclamation} />} {FIELD_LABELS[field]}</dt>
              <dd>{item[field]}</dd>
            </div>
          ))}
        </dl>
      )}

      <PriceSelector value={price} onChange={setPrice} date />
      <div className="cards">
        <div className="card"><span className="label-s sub">On the shelf</span><span className="value">{quantity(detail.data.onHandMilli)} {item.unit}</span></div>
        {item.origin === "bought" && <div className="card"><span className="label-s sub">Bought</span><span className="value">{quantity(detail.data.boughtMilli)} {item.unit}</span></div>}
        <div className="card">
          <span className="label-s sub">{item.origin === "made" ? "Cost of one" : "Price of one"}</span>
          <span className="value">{detail.data.unitE4 === null ? "—" : moneyE4(detail.data.unitE4)}</span>
          {!detail.data.complete && detail.data.unitE4 !== null && <span className="hint error">Something in its cost has never been bought</span>}
        </div>
        <div className="card">
          <span className="label-s sub">Value on the shelf</span>
          <span className="value">{detail.data.unitE4 === null ? "—" : money(Math.round((detail.data.onHandMilli * detail.data.unitE4) / 100_000))}</span>
        </div>
      </div>

      {item.origin === "bought" && history.length > 0 && (
        <LineChart title="Price paid per purchase" data={history.map((p) => ({ label: date(p.on), e4: p.unitE4 }))} height={200} />
      )}

      {bom && (
        <section className="panel">
          <div className="panel-head">
            <h2>Made of</h2>
            <span className="spacer" />
            <Link to={`/inventory/components/${item.id}`} className="item-link">Open the bill of materials</Link>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>PART</th><th className="num">QUANTITY</th><th className="num">UNIT PRICE</th><th className="num">COST</th></tr></thead>
              <tbody>
                {bom.lines.map((l) => (
                  <tr key={l.partId}>
                    <td><Link to={`/inventory/items/${l.partId}`} className="item-link">{l.name}</Link></td>
                    <td className="num">{quantity(l.quantityMilli)} {l.unit}</td>
                    <td className="num">{l.unitE4 === null ? <span className="muted">never bought</span> : moneyE4(l.unitE4)}</td>
                    <td className="num">{l.totalCents === null ? <span className="muted">—</span> : money(l.totalCents)}</td>
                  </tr>
                ))}
                {bom.lines.length === 0 && <tr><td colSpan={4} className="empty">No parts yet</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {detail.data.usedIn.length > 0 && (
        <p className="muted">
          Goes into: {detail.data.usedIn.map((u, i) => <span key={u.id}>{i > 0 && ", "}<Link to={`/inventory/components/${u.id}`} className="item-link">{u.name}</Link></span>)}
        </p>
      )}

      <section className="panel">
        <div className="panel-head">
          <h2>Where it is</h2>
          <span className="spacer" />
          {canEdit && <Button small icon={faPlus} onClick={() => setReceiving(!receiving)}>{receiving ? "Close" : "More arrived"}</Button>}
        </div>
        {receiving && items.data && (
          <ReceiveForm items={items.data} presetItemId={itemId} lookups={lookups} onDone={() => setReceiving(false)} onCancel={() => setReceiving(false)} />
        )}
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>PLACE</th><th>EXACTLY</th><th className="num">QUANTITY</th><th /></tr></thead>
            <tbody>
              {stock.map((place) => (
                <FragmentRow key={placeKey(place)} colSpan={4} open={placeOpen === placeKey(place)}
                  panel={<MovementForm item={item} place={place} lookups={lookups} onDone={() => setPlaceOpen(null)} onCancel={() => setPlaceOpen(null)} />}>
                  <td>{place.label}</td>
                  <td>{place.spot || <span className="muted">—</span>}</td>
                  <td className={`num${place.quantityMilli < 0 ? " cell-negative" : ""}`}>{quantity(place.quantityMilli)} {item.unit}</td>
                  <td className="num">
                    {canEdit && <Button small variant="ghost" onClick={() => setPlaceOpen(placeOpen === placeKey(place) ? null : placeKey(place))}>{placeOpen === placeKey(place) ? "Close" : "Use, move, count…"}</Button>}
                  </td>
                </FragmentRow>
              ))}
              {stock.length === 0 && <tr><td colSpan={4} className="empty">None on the shelf</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>What happened</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>DATE</th><th /><th className="num">QUANTITY</th><th>PLACE</th><th>PROJECT</th><th className="num">NET PRICE</th><th>NOTE</th></tr></thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id}>
                  <td>{date(m.on)}</td>
                  <td>{KIND[m.kind]}{m.budgetLineId !== null && <span className="muted"> · from the budget</span>}</td>
                  <td className="num">{movementQuantity(m)}</td>
                  <td>{m.location}{m.spot ? ` (${m.spot})` : ""}</td>
                  <td>{m.projectName ?? <span className="muted">—</span>}</td>
                  <td className="num">{m.unitNet === null ? "" : moneyE4(Math.round(Number(m.unitNet) * 10_000))}</td>
                  <td>{m.note}</td>
                </tr>
              ))}
              {movements.length === 0 && <tr><td colSpan={7} className="empty">Nothing yet</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

/** A table row that can open a panel under itself. */
function FragmentRow({ children, panel, open, colSpan }: { children: React.ReactNode; panel: React.ReactNode; open: boolean; colSpan: number }) {
  return (
    <>
      <tr>{children}</tr>
      {open && <tr className="row-panel"><td colSpan={colSpan}>{panel}</td></tr>}
    </>
  );
}
