import { faCheck } from "@fortawesome/free-solid-svg-icons";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api, type ReceiveBody } from "../api/client";
import type { ItemDraft, ItemRow, PendingRow } from "../api/types";
import { moneyE4, quantity as showQuantity } from "../lib/format";
import { draftBody, emptyDraft, itemLabel, paramErrors, type InventoryLookups } from "../lib/inventory";
import { carLabel, useSeasons } from "../lib/season";
import { todayIso } from "../lib/today";
import { useAction } from "../lib/useAction";
import { fieldSetter, useDraft } from "../lib/useDraft";
import { DraftNote } from "./DraftNote";
import { Button } from "./Button";
import { SearchSelect } from "./SearchSelect";
import { ItemEditor } from "./ItemEditor";
import { Field, FormActions } from "./ui";

/**
 * Puts goods on the shelf. Started from a purchase of the budget (`line`) the prices, the project
 * and the quantity still to arrive come from the budget; started on its own it is for goods
 * that were never in the budget, priced by hand. The goods are an existing item or a new one.
 */
/** What is written in the form that receives goods. */
interface ReceiveDraft {
  mode: "existing" | "new";
  itemId: string;
  item: ItemDraft;
  amount: string;
  receivedOn: string;
  location: string;
  spot: string;
  unitNet: string;
  vatRate: number;
  free: boolean;
  projectId: string;
  car: string;
}

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
  // a purchase of the budget belongs to an area: the new item starts in it
  const lineArea = lookups.areas.find((a) => a.code === line?.areaCode);
  const [initial] = useState<ReceiveDraft>(() => ({
    mode: knownItem !== null || (!line && items.length > 0) ? "existing" : "new",
    itemId: knownItem === null ? "" : String(knownItem),
    item: { ...emptyDraft(), name: line?.item ?? "", brand: line?.brand ?? "", model: line?.model ?? "", category: line?.category ?? "", areaId: lineArea ? String(lineArea.id) : "" },
    amount: line ? String(line.remainingMilli / 1000) : "",
    receivedOn: todayIso(),
    location: lookups.locations[0]?.code ?? "",
    spot: "",
    unitNet: "",
    vatRate: 22,
    free: false,
    projectId: "",
    car: "",
  }));
  // what is written is kept while it is typed (docs/stile-interfaccia.md)
  const [form, setForm, saved] = useDraft<ReceiveDraft>(line ? `receive:line:${line.lineId}` : `receive:item:${presetItemId ?? "none"}`, initial);
  const { mode, itemId, amount, receivedOn, location, spot, unitNet, vatRate, free, projectId, car } = form;
  const draft = form.item;
  const set = fieldSetter(setForm);
  const setMode = set("mode");
  const setItemId = set("itemId");
  const setDraft = set("item");
  const setAmount = set("amount");
  const setReceivedOn = set("receivedOn");
  const setLocation = set("location");
  const setSpot = set("spot");
  const setUnitNet = set("unitNet");
  const setVatRate = set("vatRate");
  const setFree = set("free");
  const setProjectId = set("projectId");
  const setCar = set("car");
  // goods from outside the budget are for the car of the season of their date, unless another is chosen
  const seasons = useSeasons().data ?? [];
  const dateSeason = seasons.find((s) => s.startsOn <= receivedOn && receivedOn <= s.endsOn);

  const ready =
    amount !== "" && location !== "" && (line !== undefined || unitNet !== "") &&
    // a new item needs a name; its type is optional (without one it keeps the category of the purchase)
    (mode === "existing" ? itemId !== "" : draft.name.trim() !== "" && Object.keys(paramErrors(draft, lookups.types)).length === 0);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const body: ReceiveBody = { quantity: amount, receivedOn, location, spot: spot.trim() };
    if (mode === "existing") body.itemId = Number(itemId);
    else body.newItem = draftBody(draft, lookups);
    if (line) body.lineId = line.lineId;
    else {
      body.unitNet = unitNet;
      body.vatRate = vatRate;
      body.free = free;
      if (projectId) body.projectId = Number(projectId);
      if (car) body.carSeasonId = Number(car);
    }
    if (await act(() => api.receive(body))) {
      saved.discard();
      onDone();
    }
  };

  return (
    <form className="receive" onSubmit={submit}>
      <DraftNote draft={saved} />
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
            choices={[{ value: "", label: "Choose…" }, ...items.map((i) => ({ value: String(i.id), label: `${itemLabel(i)}${i.code ? ` (${i.code})` : ""}` }))]}
          />
        </Field>
      ) : (
        <ItemEditor draft={draft} onChange={(change) => setDraft({ ...draft, ...change })} lookups={lookups} idPrefix="receive-new" suggestCategory={line?.category} />
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
            <Field label="Car" htmlFor="receive-car">
              <select id="receive-car" className="input small" value={car} onChange={(e) => setCar(e.target.value)}>
                <option value="">{dateSeason ? `${dateSeason.car} (from the date)` : "From the date"}</option>
                {seasons.map((s) => <option key={s.id} value={s.id}>{carLabel(s)}</option>)}
              </select>
            </Field>
            <label className="checkbox">
              <input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} />
              A gift: nothing paid by the team
            </label>
          </>
        )}
      </div>

      <FormActions>
        <Button small icon={faCheck} type="submit" disabled={!ready}>Put on the shelf</Button>
        {onCancel && <Button small variant="ghost" onClick={() => saved.leave(onCancel)}>Cancel</Button>}
      </FormActions>
    </form>
  );
}
