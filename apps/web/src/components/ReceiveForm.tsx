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
import { SearchSelect } from "./SearchSelect";
import { ItemEditor } from "./ItemEditor";
import { Field } from "./ui";

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
        <Field label="Item" htmlFor="receive-item">
          <SearchSelect
            id="receive-item"
            value={itemId}
            onChange={setItemId}
            choices={[{ value: "", label: "Choose…" }, ...items.map((i) => ({ value: String(i.id), label: `${i.name}${i.code ? ` (${i.code})` : ""}` }))]}
          />
        </Field>
      ) : (
        <ItemEditor draft={draft} onChange={(change) => setDraft({ ...draft, ...change })} lookups={lookups} idPrefix="receive-new" />
      )}

      <div className="form-grid">
        <Field label="Quantity arrived" htmlFor="receive-quantity">
          <input id="receive-quantity" className="input small" type="number" min="0" step="0.001" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Arrived on" htmlFor="receive-date">
          <input id="receive-date" className="input small" type="date" min="2000-01-01" max="2100-12-31" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} />
        </Field>
        <Field label="Put in" htmlFor="receive-location">
          <SearchSelect id="receive-location" value={location} onChange={setLocation} choices={lookups.locations.map((l) => ({ value: l.code, label: l.label }))} />
        </Field>
        <Field label="Where exactly" htmlFor="receive-spot">
          <input id="receive-spot" className="input small" maxLength={100} placeholder="Shelf 2, red box" value={spot} onChange={(e) => setSpot(e.target.value)} />
        </Field>
        {!line && (
          <>
            <Field label="Net price per unit (€)" htmlFor="receive-net">
              <input id="receive-net" className="input small" type="number" min="0" step="0.0001" value={unitNet} onChange={(e) => setUnitNet(e.target.value)} />
            </Field>
            <Field label="VAT" htmlFor="receive-vat">
              <select id="receive-vat" className="input small" value={vatRate} onChange={(e) => setVatRate(Number(e.target.value))}>
                {lookups.vatRates.map((r) => <option key={r} value={r}>{r}%</option>)}
              </select>
            </Field>
            <Field label="For project (optional)" htmlFor="receive-project">
              <SearchSelect
                id="receive-project"
                value={projectId}
                onChange={setProjectId}
                choices={[{ value: "", label: "(none)" }, ...(projects.data ?? []).map((p) => ({ value: String(p.id), label: `${p.areaName}: ${p.name}` }))]}
              />
            </Field>
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
