import { faCheck } from "@fortawesome/free-solid-svg-icons";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api, type MovementBody } from "../api/client";
import type { InventoryItem, StockPlace } from "../api/types";
import { quantity as showQuantity } from "../lib/format";
import type { InventoryLookups } from "../lib/inventory";
import { todayIso } from "../lib/today";
import { SearchSelect } from "./SearchSelect";
import { useAction } from "../lib/useAction";
import { Button } from "./Button";
import { Field } from "./ui";

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
          <Field label="How many there are, counted" htmlFor="move-counted">
            <input id="move-counted" className="input small" type="number" min="0" step="0.001" value={counted} onChange={(e) => setCounted(e.target.value)} />
          </Field>
        ) : (
          <Field label={<>Quantity ({item.unit})</>} htmlFor="move-quantity">
            <input id="move-quantity" className="input small" type="number" min="0" step="0.001" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
        )}
        <Field label="On" htmlFor="move-date">
          <input id="move-date" className="input small" type="date" min="2000-01-01" max="2100-12-31" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} />
        </Field>
        {kind === "transfer" && (
          <>
            <Field label="Move to" htmlFor="move-to">
              <SearchSelect id="move-to" value={toLocation} onChange={setToLocation} choices={lookups.locations.map((l) => ({ value: l.code, label: l.label }))} />
            </Field>
            <Field label="Where exactly" htmlFor="move-to-spot">
              <input id="move-to-spot" className="input small" maxLength={100} value={toSpot} onChange={(e) => setToSpot(e.target.value)} />
            </Field>
          </>
        )}
        {kind === "use" && (
          <Field label="For project (optional)" htmlFor="move-project">
            <SearchSelect
              id="move-project"
              value={projectId}
              onChange={setProjectId}
              choices={[{ value: "", label: "(none)" }, ...(projects.data ?? []).map((p) => ({ value: String(p.id), label: `${p.areaName}: ${p.name}` }))]}
            />
          </Field>
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
