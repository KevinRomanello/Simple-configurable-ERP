import { faTrash } from "@fortawesome/free-solid-svg-icons";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { api } from "../api/client";
import type { BomLine, ItemRow } from "../api/types";
import { IconButton } from "../components/Button";
import { BuildForm } from "../components/BuildForm";
import { HazardPills } from "../components/HazardPills";
import { ItemThumb } from "../components/ItemThumb";
import { LineChart } from "../components/LineChart";
import { PriceSelector } from "../components/PriceSelector";
import { SearchSelect } from "../components/SearchSelect";
import { AddSection, Card, Cards, DataTable, DetailHeader, Field, FormPanel, Loading, Message, Panel, type Column } from "../components/ui";
import { useMe } from "../lib/auth";
import { money, moneyE4, monthOfDate, quantity } from "../lib/format";
import { useInventoryLookups } from "../lib/inventory";
import { usePrice } from "../lib/price";
import { useAction } from "../lib/useAction";

/** The form to add a part to what the team makes, opened from the yellow «Add part». */
function AddPart({ componentId, candidates, onDone }: { componentId: number; candidates: ItemRow[]; onDone: () => void }) {
  const act = useAction();
  const [partId, setPartId] = useState("");
  const [amount, setAmount] = useState("1");
  const [note, setNote] = useState("");

  const submit = async () => {
    if (await act(() => api.addPart(componentId, { partId: Number(partId), quantity: amount, ...(note.trim() ? { note: note.trim() } : {}) }))) onDone();
  };

  return (
    <FormPanel title="Add a part" submitLabel="Add part" canSubmit={partId !== "" && amount !== ""} onSubmit={submit} onCancel={onDone}>
      <Field label="Part" htmlFor="part-item">
        <SearchSelect
          id="part-item"
          value={partId}
          onChange={setPartId}
          choices={[{ value: "", label: "Choose…" }, ...candidates.map((i) => ({ value: String(i.id), label: `${i.name}${i.origin === "made" ? " (made)" : ""}` }))]}
        />
      </Field>
      <Field label="Quantity in one" htmlFor="part-quantity">
        <input id="part-quantity" className="input small" type="number" min="0" step="0.001" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="Note" htmlFor="part-note">
        <input id="part-note" className="input small" maxLength={500} placeholder="Optional" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </FormPanel>
  );
}

/** One thing the team makes: its parts with their prices, the cost of one and how the cost changed. */
export function ComponentPage() {
  const componentId = Number(useParams().id);
  const act = useAction();
  const canEdit = useMe().permissions.canManageInventory;
  const [price, setPrice] = usePrice();
  const detail = useQuery({ queryKey: ["inventory-component", componentId, price], queryFn: () => api.component(componentId, price) });
  const items = useQuery({ queryKey: ["inventory-items", price, {}], queryFn: () => api.inventoryItems(price) });
  const lookups = useInventoryLookups();

  if (detail.isError) return <Message>This is not something the team makes, or it does not exist.</Message>;
  if (!detail.data) return <Loading />;
  const { item, bom, series, notes } = detail.data;
  const taken = new Set(bom.lines.map((l) => l.partId));
  const candidates = (items.data ?? []).filter((i) => i.id !== componentId && !taken.has(i.id));
  const row = (items.data ?? []).find((i) => i.id === componentId);
  const hasPicture = row?.hasImage ?? false;

  const columns: Column<BomLine>[] = [
    {
      key: "part",
      header: "PART",
      sort: (l) => l.name,
      cell: (l) => (
        <>
          <Link to={l.origin === "made" ? `/inventory/components/${l.partId}` : `/inventory/items/${l.partId}`} className="item-link">{l.name}</Link>
          {l.origin === "made" && <span className="pill teal">made</span>}
        </>
      ),
    },
    {
      key: "quantity",
      header: "QUANTITY IN ONE",
      num: true,
      sort: (l) => l.quantityMilli,
      cell: (l) => (
        <>
          {canEdit ? (
            <input
              className="input small qty" type="number" min="0" step="0.001" defaultValue={l.quantityMilli / 1000} aria-label={`Quantity of ${l.name}`}
              onBlur={(e) => { if (e.target.value !== "" && Number(e.target.value) * 1000 !== l.quantityMilli) void act(() => api.updatePart(componentId, l.partId, { quantity: e.target.value })); }}
            />
          ) : quantity(l.quantityMilli)} {l.unit}
        </>
      ),
    },
    {
      key: "unit",
      header: "UNIT PRICE",
      num: true,
      sort: (l) => l.unitE4,
      cell: (l) => <>{l.unitE4 === null ? <span className="muted">never bought</span> : moneyE4(l.unitE4)}{!l.complete && l.unitE4 !== null && <span className="negative"> !</span>}</>,
    },
    { key: "cost", header: "COST", num: true, sort: (l) => l.totalCents, cell: (l) => (l.totalCents === null ? <span className="muted">—</span> : money(l.totalCents)) },
    { key: "note", header: "NOTE", cell: (l) => notes[l.partId] ?? "" },
    {
      key: "remove",
      header: "",
      num: true,
      cell: (l) => canEdit && <IconButton icon={faTrash} label={`Remove ${l.name}`} danger onClick={() => act(() => api.removePart(componentId, l.partId))} />,
    },
  ];

  return (
    <>
      <DetailHeader
        picture={<ItemThumb id={item.id} hasImage={hasPicture} size="full" name={item.name} />}
        title={item.name}
        subtitle={<>{item.purpose ?? "Made by the team"} · <Link to={`/inventory/items/${item.id}`} className="item-link">open the item</Link><HazardPills item={item} /></>}
      />

      <PriceSelector value={price} onChange={setPrice} date />
      <Cards>
        {row && <Card caption="On the shelf">{quantity(row.onHandMilli)} {item.unit}</Card>}
        <Card caption="Cost to make one now" hint={!bom.complete && <span className="hint error">Some parts have never been bought: the cost is missing them</span>}>
          {bom.unitE4 === null ? "—" : moneyE4(bom.unitE4)}
        </Card>
        <Card caption="Parts">{bom.lines.length}</Card>
        <Card caption="Sum of the lines">{bom.totalCents === null ? "—" : money(bom.totalCents)}</Card>
      </Cards>

      <LineChart
        title="Cost of one, at the end of each month"
        // the box over each month lists the parts with their price then, and what changed since the month before
        data={series.map((p, i) => ({
          label: monthOfDate(p.on),
          e4: p.unitE4,
          parts: p.parts.map((part) => ({
            name: part.name,
            quantityMilli: part.quantityMilli,
            e4: part.unitE4,
            before: series[i - 1]?.parts.find((x) => x.partId === part.partId)?.unitE4 ?? null,
          })),
        }))}
      />

      {canEdit && lookups && bom.lines.length > 0 && (
        <Panel>
          <AddSection label="We made some" form={(close) => <BuildForm componentId={componentId} unit={item.unit} lookups={lookups} onDone={close} />} />
        </Panel>
      )}

      <Panel title="Made of">
        <DataTable
          title="Made of"
          columns={columns}
          rows={bom.lines}
          rowKey={(l) => l.partId}
          empty="No parts yet"
          footer={bom.totalCents !== null && <tr className="total"><td colSpan={3}>Total</td><td className="num">{money(bom.totalCents)}</td><td colSpan={2} /></tr>}
        />
        {canEdit && <AddSection label="Add part" form={(close) => <AddPart componentId={componentId} candidates={candidates} onDone={close} />} />}
      </Panel>
    </>
  );
}
