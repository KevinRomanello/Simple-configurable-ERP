import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { inventoryApi } from "./api";
import type { InventoryItem, PlanLineView, PlanView } from "./types";
import { quantity as showQuantity } from "../../core/format";
import { makeDefaultsOf, missingText, takesText, type InventoryLookups, type MakeDefaults } from "./inventory";
import { todayIso } from "../../core/today";
import { useAction } from "../../core/useAction";
import { fieldSetter, useDraft } from "../../core/useDraft";
import { Button } from "../../core/Button";
import { DraftNote } from "../../core/DraftNote";
import { MakeDefaultsFields } from "./MakeDefaultsFields";
import { Column, DataTable, Field, FormPanel } from "../../core/ui";
import { useProjects } from "./projects";

/** What the plan says about one part: there is enough, some are short, or some have to be made first. */
function Status({ line }: { line: PlanLineView }) {
  if (line.missingMilli > 0) return <span className="pill short">missing {showQuantity(line.missingMilli)} {line.unit}</span>;
  if (line.makeFirstMilli > 0) return <span className="pill teal">make {showQuantity(line.makeFirstMilli)} first</span>;
  return <span className="pill ok">enough</span>;
}

/** The sentence over the table: can it be made, and if not, what is missing and how many can be. */
function Verdict({ plan, unit }: { plan: PlanView; unit: string }) {
  const first = plan.lines.filter((l) => l.makeFirstMilli > 0);
  const many = `${showQuantity(plan.quantityMilli)} ${unit}`;
  if (plan.lines.length === 0) return <p className="verdict short">It has no parts yet: add what it is made of first.</p>;
  if (!plan.enough) {
    const limits = plan.limitedBy.map((p) => p.name).join(", ");
    return (
      <p className="verdict short">
        Not enough for {many}: {missingText(plan.lines.filter((l) => l.missingMilli > 0))} short.
        {" "}You can make {showQuantity(plan.maxMilli)} {unit} now{limits ? `, then ${limits} runs out` : ""}.
      </p>
    );
  }
  if (first.length > 0) {
    return <p className="verdict short">The parts are there for {many}, but {first.map((l) => `${showQuantity(l.makeFirstMilli)} ${l.name}`).join(", ")} must be made first: open it and make it, then come back here.</p>;
  }
  return <p className="verdict ok">Everything is there for {many}.</p>;
}

/** What is written in the form that makes new pieces. */
interface BuildDraft {
  where: MakeDefaults;
  wantsChange: boolean;
  amount: string;
  builtOn: string;
  /** Part id -> the only place it is taken from; the others come from wherever they are. */
  takeFrom: Record<number, string>;
  method: "average" | "last";
  note: string;
}

/**
 * «Make new»: type how many and see what it takes, part by part, against the shelf of every place, and where each part is
 * taken from (the place with the most first; a menu on each row takes it from one place only). When everything is there
 * the parts are taken off the shelf and used for the project, and the pieces are put on it with the cost they have now.
 * The project and the place of the pieces start from what was set when the thing was created. docs/inventario.md, §21.
 */
export function BuildForm({ item, lookups, onDone }: { item: InventoryItem; lookups: InventoryLookups; onDone: () => void }) {
  const act = useAction();
  const projects = useProjects();
  const firstPlace = lookups.locations[0]?.code ?? "";
  // what the item was created with; a place it has none for starts on the first one
  const [initial] = useState<BuildDraft>(() => {
    const defaults = makeDefaultsOf(item);
    return { where: { ...defaults, to: defaults.to || firstPlace }, wantsChange: false, amount: "1", builtOn: todayIso(), takeFrom: {}, method: "average", note: "" };
  });
  // what is written is kept while it is typed (docs/stile-interfaccia.md)
  const [form, setForm, saved] = useDraft<BuildDraft>(`build:${item.id}`, initial);
  const { where, wantsChange, amount, builtOn, takeFrom, method, note } = form;
  const set = fieldSetter(setForm);
  const [setWhere, setWantsChange, setAmount, setBuiltOn, setTakeFrom, setMethod, setNote] = [set("where"), set("wantsChange"), set("amount"), set("builtOn"), set("takeFrom"), set("method"), set("note")];
  // projects are of a season: the one saved with the item counts only if it is among those of the season on the screen
  const known = projects.data ? projects.data.some((p) => String(p.id) === where.projectId) : where.projectId !== "";
  const projectId = known ? where.projectId : "";
  const changing = wantsChange || projectId === "" || item.makeTo === null;

  const asked = Number(amount) > 0 ? amount : null;
  const plan = useQuery({
    queryKey: ["inventory-plan", item.id, asked, takeFrom],
    queryFn: () => inventoryApi.componentPlan(item.id, { quantity: asked ?? "1", from: takeFrom }),
    enabled: asked !== null,
    placeholderData: (previous) => previous,
  });
  // the plan on the screen is the one of what is typed now, and nothing has to be made first (that is a build of its own)
  const current = plan.data && !plan.isPlaceholderData ? plan.data : null;
  const ready = current !== null && current.enough && current.lines.every((l) => l.makeFirstMilli === 0) && projectId !== "" && where.to !== "";

  const placeName = (code: string) => lookups.locations.find((l) => l.code === code)?.label ?? code;
  const choose = (partId: number, place: string) => {
    const { [partId]: _gone, ...rest } = takeFrom;
    setTakeFrom(place === "" ? rest : { ...rest, [partId]: place });
  };
  const submit = async () => {
    const body = { componentId: item.id, projectId: Number(projectId), quantity: amount, builtOn: builtOn || todayIso(), takeFrom, toLocation: where.to, toSpot: where.spot.trim(), method };
    if (await act(() => inventoryApi.build({ ...body, ...(note.trim() ? { note: note.trim() } : {}) }))) {
      saved.discard();
      onDone();
    }
  };
  const projectName = projects.data?.find((p) => String(p.id) === projectId);

  const columns: Column<PlanLineView>[] = [
    {
      key: "part",
      header: "PART",
      cell: (l) => (l.origin === "made" ? <Link to={`/inventory/components/${l.partId}`} className="item-link">{l.name}</Link> : l.name),
    },
    { key: "needed", header: "NEEDED", num: true, cell: (l) => `${showQuantity(l.neededMilli)} ${l.unit}` },
    { key: "available", header: "ON THE SHELF", num: true, cell: (l) => `${showQuantity(l.availableMilli)} ${l.unit}` },
    { key: "left", header: "LEFT AFTER", num: true, cell: (l) => `${showQuantity(l.leftMilli)} ${l.unit}` },
    {
      key: "takeFrom",
      header: "TAKE FROM",
      cell: (l) => {
        // a part that is wholly to be made first is not taken from the shelf
        if (l.takes.length === 0 && l.places.length === 0 && l.takeFrom === null) return <span className="muted">—</span>;
        const places = l.takeFrom !== null && !l.places.some((p) => p.location === l.takeFrom) ? [...l.places, { location: l.takeFrom, quantityMilli: 0 }] : l.places;
        return (
          <>
            <select className="input small" aria-label={`Take ${l.name} from`} value={l.takeFrom ?? ""} onChange={(e) => choose(l.partId, e.target.value)}>
              <option value="">Automatic</option>
              {places.map((p) => <option key={p.location} value={p.location}>{placeName(p.location)} ({showQuantity(p.quantityMilli)} {l.unit})</option>)}
            </select>
            {l.takes.length > 0 && <span className="hint">{takesText(l.takes, l.unit, placeName)}</span>}
          </>
        );
      },
    },
    { key: "status", header: "", cell: (l) => <Status line={l} /> },
  ];

  return (
    <FormPanel
      title="Make new"
      description="Type how many. The parts are taken off the shelf, from every place where they are, and used for the project; the pieces made are put on the shelf. Their cost is fixed now: pieces made earlier keep theirs."
      submitLabel="Make them"
      canSubmit={ready}
      onSubmit={submit}
      onCancel={() => saved.leave(onDone)}
      layout="stack"
    >
      <DraftNote draft={saved} />
      <div className="form-grid">
        <Field label={<>How many ({item.unit})</>} htmlFor="build-quantity">
          <input id="build-quantity" className="input small" type="number" min="0" step="0.001" value={amount} autoFocus onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Made on" htmlFor="build-date">
          <input id="build-date" className="input small" type="date" min="2000-01-01" max="2100-12-31" value={builtOn} onChange={(e) => setBuiltOn(e.target.value)} />
        </Field>
        <Field label="Note" htmlFor="build-note">
          <input id="build-note" className="input small" maxLength={500} placeholder="Optional" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>

      {plan.data && asked !== null && (
        <>
          <Verdict plan={plan.data} unit={item.unit} />
          <DataTable title="What it takes" columns={columns} rows={plan.data.lines} rowKey={(l) => l.partId} empty="No parts" />
        </>
      )}

      {changing ? (
        <>
          <MakeDefaultsFields value={{ ...where, projectId }} onChange={(change) => setWhere({ ...where, ...change })} lookups={lookups} idPrefix="build" required />
          <div className="form-grid">
            <Field label="Price of the parts" htmlFor="build-method">
              <select id="build-method" className="input small" value={method} onChange={(e) => setMethod(e.target.value as "average" | "last")}>
                <option value="average">Average of the purchases</option>
                <option value="last">Last purchase</option>
              </select>
            </Field>
          </div>
        </>
      ) : (
        <p className="muted">
          For {projectName ? `${projectName.areaName}: ${projectName.name}` : "the project"} · pieces to {placeName(where.to)}
          {where.spot.trim() ? ` (${where.spot.trim()})` : ""}{" "}
          <Button small variant="ghost" onClick={() => setWantsChange(true)}>Change</Button>
        </p>
      )}
    </FormPanel>
  );
}
