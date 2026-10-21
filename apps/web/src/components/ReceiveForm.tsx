import { faCheck } from "@fortawesome/free-solid-svg-icons";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api, type ReceiveBody } from "../api/client";
import type { ItemDraft, ItemRow, PendingRow } from "../api/types";
import { moneyE4, quantity as showQuantity } from "../lib/format";
import { draftBody, emptyDraft, type InventoryLookups } from "../lib/inventory";
import { todayIso } from "../lib/today";
import { useAction } from "../lib/useAction";
import { Button } from "./Button";
import { ItemEditor } from "./ItemEditor";

/**
 * Puts goods on the shelf. Started from a purchase of the budget (`line`) the prices, the project
 * and the quantity still to arrive come from the budget; started on its own it is for goods
 * that were never in the budget, priced by hand. The goods are an existing item or a new one.
 */
export function ReceiveForm({
  line, items, presetItemId, lookups, onDone, onCancel,
}: {
  line?: PendingRow;
  items: ItemRow[];
  /** Start with this item chosen (more goods of an item that is already open on the screen). */
  presetItemId?: number;
  lookups: InventoryLookups;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const act = useAction();
  const projects = useQuery({ queryKey: ["inventory-projects"], queryFn: api.inventoryProjects, enabled: line === undefined });
  const knownItem = line ? (line.receivedItemId ?? line.suggestedItemId) : (presetItemId ?? null);
  const [mode, setMode] = useState<"existing" | "new">(knownItem !== null || (!line && items.length > 0) ? "existing" : "new");
  const [itemId, setItemId] = useState(knownItem === null ? "" : String(knownItem));
  const [draft, setDraft] = useState<ItemDraft>({ ...emptyDraft(), name: line?.item ?? "", category: line?.category ?? "" });
  const [amount, setAmount] = useState(line ? String(line.remainingMilli / 1000) : "");
  const [receivedOn, setReceivedOn] = useState(todayIso());
  const [location, setLocation] = useState(lookups.locations[0]?.code ?? "");
  const [spot, setSpot] = useState("");
  const [unitNet, setUnitNet] = useState("");
  const [vatRate, setVatRate] = useState(22);
  const [free, setFree] = useState(false);
  const [projectId, setProjectId] = useState("");

  const ready =
    amount !== "" && location !== "" && (mode === "existing" ? itemId !== "" : draft.name.trim() !== "") && (line !== undefined || unitNet !== "");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const body: ReceiveBody = { quantity: amount, receivedOn, location, spot: spot.trim() };
    if (mode === "existing") body.itemId = Number(itemId);
    else body.newItem = draftBody(draft, lookups.fields);
    if (line) body.lineId = line.lineId;
    else {
      body.unitNet = unitNet;
      body.vatRate = vatRate;
      body.free = free;
      if (projectId) body.projectId = Number(projectId);
    }
    if (await act(() => api.receive(body))) onDone();
  };

  return (
    <form className="receive" onSubmit={submit}>
      {line ? (
        <p className="muted">
          From the budget: <strong>{line.item}</strong>, {line.projectName} ({line.areaName})
          {line.supplierName ? `, bought from ${line.supplierName}` : ""}. Bought {showQuantity(line.boughtMilli)}, arrived{" "}
          {showQuantity(line.receivedMilli)}, still to arrive {showQuantity(line.remainingMilli)}. Per unit: {moneyE4(line.prices.net)} net,{" "}
          {moneyE4(line.prices.gross)} with VAT, {moneyE4(line.prices.team)} for the team.
        </p>
      ) : (
        <p className="muted">Goods that were not in the budget: a purchase made on the side, a gift, something already here.</p>
      )}

      <div className="toggle-row" role="group" aria-label="Which item">
        <button type="button" className={`chip${mode === "existing" ? " on" : ""}`} onClick={() => setMode("existing")}>An item already in the inventory</button>
        <button type="button" className={`chip${mode === "new" ? " on" : ""}`} onClick={() => setMode("new")}>A new item</button>
      </div>

      {mode === "existing" ? (
        <div className="field">
          <label htmlFor="receive-item">Item</label>
          <select id="receive-item" className="input small" value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">Choose…</option>
            {items.map((i) => <option key={i.id} value={i.id}>{i.name}{i.code ? ` (${i.code})` : ""}</option>)}
          </select>
        </div>
      ) : (
        <ItemEditor draft={draft} onChange={(change) => setDraft({ ...draft, ...change })} lookups={lookups} idPrefix="receive-new" />
      )}

      <div className="form-grid">
        <div className="field">
          <label htmlFor="receive-quantity">Quantity arrived</label>
          <input id="receive-quantity" className="input small" type="number" min="0" step="0.001" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="receive-date">Arrived on</label>
          <input id="receive-date" className="input small" type="date" min="2000-01-01" max="2100-12-31" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="receive-location">Put in</label>
          <select id="receive-location" className="input small" value={location} onChange={(e) => setLocation(e.target.value)}>
            {lookups.locations.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="receive-spot">Where exactly</label>
          <input id="receive-spot" className="input small" maxLength={100} placeholder="Shelf 2, red box" value={spot} onChange={(e) => setSpot(e.target.value)} />
        </div>
        {!line && (
          <>
            <div className="field">
              <label htmlFor="receive-net">Net price per unit (€)</label>
              <input id="receive-net" className="input small" type="number" min="0" step="0.0001" value={unitNet} onChange={(e) => setUnitNet(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="receive-vat">VAT</label>
              <select id="receive-vat" className="input small" value={vatRate} onChange={(e) => setVatRate(Number(e.target.value))}>
                {lookups.vatRates.map((r) => <option key={r} value={r}>{r}%</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="receive-project">For project (optional)</label>
              <select id="receive-project" className="input small" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">(none)</option>
                {projects.data?.map((p) => <option key={p.id} value={p.id}>{p.areaName}: {p.name}</option>)}
              </select>
            </div>
            <label className="checkbox">
              <input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} />
              A gift: nothing paid by the team
            </label>
          </>
        )}
      </div>

      <div className="inline-form">
        <Button small icon={faCheck} type="submit" disabled={!ready}>Put on the shelf</Button>
        {onCancel && <Button small variant="ghost" onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  );
}
