import { faCheck } from "@fortawesome/free-solid-svg-icons";
import { useState, type FormEvent } from "react";
import { inventoryApi, type MovementBody } from "./api";
import type { InventoryItem, StockPlace } from "./types";
import { quantity as showQuantity } from "../../core/format";
import type { InventoryLookups } from "./inventory";
import { todayIso } from "../../core/today";
import { SearchSelect } from "../../core/SearchSelect";
import { useAction } from "../../core/useAction";
import { fieldSetter, useDraft } from "../../core/useDraft";
import { DraftNote } from "../../core/DraftNote";
import { Button } from "../../core/Button";
import { Field, FormActions } from "../../core/ui";
import { useProjects } from "./projects";

const KINDS = [
  { value: "use", label: "Use" },
  { value: "transfer", label: "Move" },
  { value: "adjustment", label: "Count" },
  { value: "disposal", label: "Dispose" },
] as const;

/** What can be done with the goods that are at one place: use them, move them, count them, throw them away. */
/** What is written in the form that uses, moves or counts goods. */
interface MovementDraft {
  kind: MovementBody["kind"];
  amount: string;
  counted: string;
  occurredOn: string;
  toLocation: string;
  toSpot: string;
  projectId: string;
  note: string;
}

export function MovementForm({
  item, place, lookups, onDone, onCancel, kind: firstKind = "use",
}: {
  item: InventoryItem;
  place: StockPlace;
  lookups: InventoryLookups;
  onDone: () => void;
  onCancel: () => void;
  /** What it starts on (on a phone each one has its own button). */
  kind?: MovementBody["kind"];
}) {
  const act = useAction();
  const projects = useProjects();
  const [initial] = useState<MovementDraft>(() => ({
    kind: firstKind,
    amount: "",
    counted: String(place.quantityMilli / 1000),
    occurredOn: todayIso(),
    toLocation: lookups.locations.find((l) => l.code !== place.location)?.code ?? place.location,
    toSpot: "",
    projectId: "",
    note: "",
  }));
  // what is written is kept while it is typed (docs/stile-interfaccia.md); the thing it is for is the item and the place
  const [form, setForm, saved] = useDraft<MovementDraft>(`stock:${item.id}:${place.location}:${place.spot}`, initial);
  const { kind, amount, counted, occurredOn, toLocation, toSpot, projectId, note } = form;
  const set = fieldSetter(setForm);
  const setKind = set("kind");
  const setAmount = set("amount");
  const setCounted = set("counted");
  const setOccurredOn = set("occurredOn");
  const setToLocation = set("toLocation");
  const setToSpot = set("toSpot");
  const setProjectId = set("projectId");
  const setNote = set("note");

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
    if (await act(() => inventoryApi.addMovement(body))) {
      saved.discard();
      onDone();
    }
  };

  return (
    <form className="receive" onSubmit={submit}>
      <DraftNote draft={saved} />
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
        {kind === "use" && projects.available && (
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
      <FormActions>
        <Button small icon={faCheck} type="submit" disabled={!ready}>Save</Button>
        <Button small variant="ghost" onClick={() => saved.leave(onCancel)}>Cancel</Button>
      </FormActions>
    </form>
  );
}
