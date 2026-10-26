import { faImage, faPen, faPlus, faTrash, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api } from "../api/client";
import type { BomLine, ItemDraft, ItemField, MovementRow, StockPlace } from "../api/types";
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
import { TableBox } from "../components/ExportBlocks";
import { SortTh } from "../components/SortTh";
import { Card, Cards, DataTable, DetailHeader, EmptyRow, Loading, Message, Panel, type Column } from "../components/ui";
import { useSort, type SortAccessors } from "../lib/sort";

const PART_COLUMNS: Column<BomLine>[] = [
  { key: "part", header: "PART", sort: (l) => l.name, cell: (l) => <Link to={`/inventory/items/${l.partId}`} className="item-link">{l.name}</Link> },
  { key: "quantity", header: "QUANTITY", num: true, sort: (l) => l.quantityMilli, cell: (l) => `${quantity(l.quantityMilli)} ${l.unit}` },
  { key: "unit", header: "UNIT PRICE", num: true, sort: (l) => l.unitE4, cell: (l) => (l.unitE4 === null ? <span className="muted">never bought</span> : moneyE4(l.unitE4)) },
  { key: "cost", header: "COST", num: true, sort: (l) => l.totalCents, cell: (l) => (l.totalCents === null ? <span className="muted">—</span> : money(l.totalCents)) },
];
const PLACES_SORT: SortAccessors<StockPlace> = {
  place: (p) => p.label,
  exactly: (p) => p.spot || null,
  quantity: (p) => p.quantityMilli,
};
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

const MOVEMENT_COLUMNS: Column<MovementRow>[] = [
  { key: "date", header: "DATE", sort: (m) => m.on, cell: (m) => date(m.on) },
  {
    key: "kind",
    header: "WHAT",
    sort: (m) => m.kind,
    cell: (m) => <>{KIND[m.kind]}{m.budgetLineId !== null && <span className="muted"> · from the budget</span>}</>,
  },
  { key: "quantity", header: "QUANTITY", num: true, sort: (m) => Number(m.quantity), cell: movementQuantity },
  { key: "place", header: "PLACE", sort: (m) => `${m.location} ${m.spot}`, cell: (m) => `${m.location}${m.spot ? ` (${m.spot})` : ""}` },
  { key: "project", header: "PROJECT", sort: (m) => m.projectName, cell: (m) => m.projectName ?? <span className="muted">—</span> },
  {
    key: "price",
    header: "NET PRICE",
    num: true,
    sort: (m) => (m.unitNet === null ? null : Number(m.unitNet)),
    cell: (m) => (m.unitNet === null ? "" : moneyE4(Math.round(Number(m.unitNet) * 10_000))),
  },
  { key: "note", header: "NOTE", cell: (m) => m.note },
];

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
  const byPlace = useSort(PLACES_SORT);

  if (detail.isError) return <Message>Item not found.</Message>;
  if (!detail.data || !lookups) return <Loading />;
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
      <DetailHeader
        picture={<ItemThumb id={item.id} hasImage={detail.data.hasImage} size="full" name={item.name} />}
        title={item.name}
        subtitle={
          <>
            {item.category ?? "No category"} · counted in {item.unit}{item.code ? ` · code ${item.code}` : ""}
            {item.origin === "made" && <> · <span className="pill teal">made by the team</span></>}
          </>
        }
      >
        {canEdit && (
          <div className="inline-form">
            <Button small variant="ghost" icon={faPen} onClick={() => setDraft(draft ? null : draftOf(item))}>{draft ? "Close" : "Edit"}</Button>
            <Button small variant="ghost" icon={faImage} onClick={() => picker.current?.click()}>{detail.data.hasImage ? "Change picture" : "Add picture"}</Button>
            {detail.data.hasImage && <Button small variant="ghost" onClick={() => act(() => api.removeImage(itemId))}>Remove picture</Button>}
            <IconButton icon={faTrash} label="Delete item" danger onClick={remove} />
            <input ref={picker} type="file" accept="image/*" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
        )}
      </DetailHeader>

      {draft && (
        <Panel>
          <ItemEditor draft={draft} onChange={(change) => setDraft({ ...draft, ...change })} lookups={lookups} idPrefix="edit" />
          <div className="inline-form">
            <Button small onClick={save} disabled={draft.name.trim() === ""}>Save</Button>
            <Button small variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
          </div>
        </Panel>
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
      <Cards>
        <Card caption="On the shelf">{quantity(detail.data.onHandMilli)} {item.unit}</Card>
        {item.origin === "bought" && <Card caption="Bought">{quantity(detail.data.boughtMilli)} {item.unit}</Card>}
        <Card
          caption={item.origin === "made" ? "Cost of one" : "Price of one"}
          hint={!detail.data.complete && detail.data.unitE4 !== null && <span className="hint error">Something in its cost has never been bought</span>}
        >
          {detail.data.unitE4 === null ? "—" : moneyE4(detail.data.unitE4)}
        </Card>
        <Card caption="Value on the shelf">
          {detail.data.unitE4 === null ? "—" : money(Math.round((detail.data.onHandMilli * detail.data.unitE4) / 100_000))}
        </Card>
      </Cards>

      {item.origin === "bought" && history.length > 0 && (
        <LineChart title="Price paid per purchase" data={history.map((p) => ({ label: date(p.on), e4: p.unitE4 }))} height={200} />
      )}

      {bom && (
        <Panel title="Made of" actions={<Link to={`/inventory/components/${item.id}`} className="item-link">Open the bill of materials</Link>}>
          <DataTable title="Made of" columns={PART_COLUMNS} rows={bom.lines} rowKey={(l) => l.partId} empty="No parts yet" />
        </Panel>
      )}

      {detail.data.usedIn.length > 0 && (
        <p className="muted">
          Goes into: {detail.data.usedIn.map((u, i) => <span key={u.id}>{i > 0 && ", "}<Link to={`/inventory/components/${u.id}`} className="item-link">{u.name}</Link></span>)}
        </p>
      )}

      {/* rows that open a form under them: built from the common pieces rather than DataTable */}
      <Panel
        title="Where it is"
        actions={canEdit && <Button small icon={faPlus} onClick={() => setReceiving(!receiving)}>{receiving ? "Close" : "More arrived"}</Button>}
      >
        {receiving && items.data && (
          <ReceiveForm items={items.data} presetItemId={itemId} lookups={lookups} onDone={() => setReceiving(false)} onCancel={() => setReceiving(false)} />
        )}
        <TableBox title="Where it is">
          <table className="data-table">
            <thead>
              <tr>
                <SortTh sort={byPlace} by="place">PLACE</SortTh>
                <SortTh sort={byPlace} by="exactly">EXACTLY</SortTh>
                <SortTh sort={byPlace} by="quantity" className="num">QUANTITY</SortTh>
                <th />
              </tr>
            </thead>
            <tbody>
              {byPlace.sorted(stock).map((place) => (
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
              {stock.length === 0 && <EmptyRow colSpan={4}>None on the shelf</EmptyRow>}
            </tbody>
          </table>
        </TableBox>
      </Panel>

      <Panel title="What happened">
        <DataTable title="What happened" columns={MOVEMENT_COLUMNS} rows={movements} rowKey={(m) => m.id} empty="Nothing yet" />
      </Panel>
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
