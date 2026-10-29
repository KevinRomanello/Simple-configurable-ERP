import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import { todayIso } from "../lib/today";
import type { InventoryLookups } from "../lib/inventory";
import { useAction } from "../lib/useAction";
import { SearchSelect } from "./SearchSelect";
import { Field, FormPanel } from "./ui";

/**
 * The form that records «we made some»: the parts are taken from the shelf (from the place chosen,
 * wherever in it they are) and used for the project it is made for; the pieces made are put on the
 * shelf, with the cost they had today.
 */
export function BuildForm({ componentId, unit, lookups, onDone }: { componentId: number; unit: string; lookups: InventoryLookups; onDone: () => void }) {
  const act = useAction();
  const projects = useQuery({ queryKey: ["inventory-projects"], queryFn: api.inventoryProjects });
  const [projectId, setProjectId] = useState("");
  const firstPlace = lookups.locations[0]?.code ?? "";
  const [quantity, setQuantity] = useState("1");
  const [builtOn, setBuiltOn] = useState(todayIso());
  const [fromLocation, setFromLocation] = useState(firstPlace);
  const [toLocation, setToLocation] = useState(firstPlace);
  const [toSpot, setToSpot] = useState("");
  const [method, setMethod] = useState<"average" | "last">("average");
  const [note, setNote] = useState("");

  const submit = async () => {
    const body = { componentId, projectId: Number(projectId), quantity, builtOn: builtOn || todayIso(), fromLocation, toLocation, toSpot: toSpot.trim(), method };
    if (await act(() => api.build({ ...body, ...(note.trim() ? { note: note.trim() } : {}) }))) onDone();
  };
  const places = lookups.locations.map((l) => <option key={l.code} value={l.code}>{l.code}</option>);

  return (
    <FormPanel
      title="We made some"
      description="The parts are taken off the shelf and used for the project; the pieces made are put on the shelf. Their cost is fixed now: pieces made earlier keep theirs."
      submitLabel="Record the build"
      canSubmit={Number(quantity) > 0 && projectId !== "" && fromLocation !== "" && toLocation !== ""}
      onSubmit={submit}
      onCancel={onDone}
    >
      <Field label={<>How many ({unit})</>} htmlFor="build-quantity">
        <input id="build-quantity" className="input small" type="number" min="0" step="0.001" value={quantity} autoFocus onChange={(e) => setQuantity(e.target.value)} />
      </Field>
      <Field label="Made on" htmlFor="build-date">
        <input id="build-date" className="input small" type="date" min="2000-01-01" max="2100-12-31" value={builtOn} onChange={(e) => setBuiltOn(e.target.value)} />
      </Field>
      <Field label="For project" htmlFor="build-project">
        <SearchSelect
          id="build-project"
          value={projectId}
          onChange={setProjectId}
          choices={[{ value: "", label: "Choose…" }, ...(projects.data ?? []).map((p) => ({ value: String(p.id), label: `${p.areaName}: ${p.name}` }))]}
        />
      </Field>
      <Field label="Take the parts from" htmlFor="build-from">
        <select id="build-from" className="input small" value={fromLocation} onChange={(e) => setFromLocation(e.target.value)}>{places}</select>
      </Field>
      <Field label="Put the pieces in" htmlFor="build-to">
        <select id="build-to" className="input small" value={toLocation} onChange={(e) => setToLocation(e.target.value)}>{places}</select>
      </Field>
      <Field label="Exactly" htmlFor="build-spot">
        <input id="build-spot" className="input small" maxLength={100} placeholder="Optional" value={toSpot} onChange={(e) => setToSpot(e.target.value)} />
      </Field>
      <Field label="Price of the parts" htmlFor="build-method">
        <select id="build-method" className="input small" value={method} onChange={(e) => setMethod(e.target.value as "average" | "last")}>
          <option value="average">Average of the purchases</option>
          <option value="last">Last purchase</option>
        </select>
      </Field>
      <Field label="Note" htmlFor="build-note">
        <input id="build-note" className="input small" maxLength={500} placeholder="Optional" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </FormPanel>
  );
}
