import { faCheck } from "@fortawesome/free-solid-svg-icons";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api, type MovementBody } from "../api/client";
import type { InventoryItem, StockPlace } from "../api/types";
import { quantity as showQuantity } from "../lib/format";
import type { InventoryLookups } from "../lib/inventory";
import { todayIso } from "../lib/today";
import { useAction } from "../lib/useAction";
import { Button } from "./Button";

const KINDS = [
  { value: "use", label: "Use" },
  { value: "transfer", label: "Move" },
  { value: "adjustment", label: "Count" },
  { value: "disposal", label: "Dispose" },
] as const;

/** What can be done with the goods that are at one place: use them, move them, count them, throw them away. */
export function MovementForm({
  item, place, lookups, onDone, onCancel,
}: {
  item: InventoryItem;
  place: StockPlace;
  lookups: InventoryLookups;
  onDone: () => void;
  onCancel: () => void;
}) {
  const act = useAction();
  const projects = useQuery({ queryKey: ["inventory-projects"], queryFn: api.inventoryProjects });
  const [kind, setKind] = useState<MovementBody["kind"]>("use");
  const [amount, setAmount] = useState("");
  const [counted, setCounted] = useState(String(place.quantityMilli / 1000));
  const [occurredOn, setOccurredOn] = useState(todayIso());
  const [toLocation, setToLocation] = useState(lookups.locations.find((l) => l.code !== place.location)?.code ?? place.location);
  const [toSpot, setToSpot] = useState("");
  const [projectId, setProjectId] = useState("");
  const [note, setNote] = useState("");

  const ready = kind === "adjustment" ? counted !== "" : amount !== "";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const body: MovementBody = { itemId: item.id, kind, occurredOn, location: place.location, spot: place.spot };
    if (kind === "adjustment") body.counted = counted;
    else body.quantity = amount;
    if (kind === "transfer") {
      body.toLocation = toLocation;
      body.toSpot = toSpot.trim();
    }
    if (kind === "use" && projectId) body.projectId = Number(projectId);
    if (note.trim()) body.note = note.trim();
    if (await act(() => api.addMovement(body))) onDone();
  };

  return (
    <form className="receive" onSubmit={submit}>
      <p className="muted">
        At {place.label}{place.spot ? ` (${place.spot})` : ""}: {showQuantity(place.quantityMilli)} {item.unit}
      </p>
      <div className="toggle-row" role="group" aria-label="What to do">
        {KINDS.map((k) => (
          <button key={k.value} type="button" className={`chip${kind === k.value ? " on" : ""}`} onClick={() => setKind(k.value)}>{k.label}</button>
        ))}
      </div>
      <div className="form-grid">
        {kind === "adjustment" ? (
          <div className="field">
            <label htmlFor="move-counted">How many there are, counted</label>
            <input id="move-counted" className="input small" type="number" min="0" step="0.001" value={counted} onChange={(e) => setCounted(e.target.value)} />
          </div>
        ) : (
          <div className="field">
            <label htmlFor="move-quantity">Quantity ({item.unit})</label>
            <input id="move-quantity" className="input small" type="number" min="0" step="0.001" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        )}
        <div className="field">
          <label htmlFor="move-date">On</label>
          <input id="move-date" className="input small" type="date" min="2000-01-01" max="2100-12-31" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} />
        </div>
        {kind === "transfer" && (
          <>
            <div className="field">
              <label htmlFor="move-to">Move to</label>
              <select id="move-to" className="input small" value={toLocation} onChange={(e) => setToLocation(e.target.value)}>
                {lookups.locations.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="move-to-spot">Where exactly</label>
              <input id="move-to-spot" className="input small" maxLength={100} value={toSpot} onChange={(e) => setToSpot(e.target.value)} />
            </div>
          </>
        )}
        {kind === "use" && (
          <div className="field">
            <label htmlFor="move-project">For project (optional)</label>
            <select id="move-project" className="input small" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">(none)</option>
              {projects.data?.map((p) => <option key={p.id} value={p.id}>{p.areaName}: {p.name}</option>)}
            </select>
          </div>
        )}
        <div className="field wide">
          <label htmlFor="move-note">Note (optional)</label>
          <input id="move-note" className="input small" maxLength={5000} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      <div className="inline-form">
        <Button small icon={faCheck} type="submit" disabled={!ready}>Save</Button>
        <Button small variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
