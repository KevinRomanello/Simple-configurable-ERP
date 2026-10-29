import { useId, useState } from "react";
import { api } from "../api/client";
import type { Phase } from "../api/types";
import { Chips } from "../components/Chips";
import { SearchSelect } from "../components/SearchSelect";
import { Field, FormPanel } from "../components/ui";
import { choosesOwnRate, lineBody, newLineDraft, PHASES_OF, type FillIn, type LineDraft, type PhaseDraft } from "../lib/newLine";
import { todayIso } from "../lib/today";
import { useAction } from "../lib/useAction";
import type { GridLookups } from "./areaColumns";

const PHASE_TITLE: Record<Phase, string> = { estimate: "EXPECTED", actual: "ACTUAL" };
const FILL_IN: { value: FillIn; label: string }[] = [
  { value: "estimate", label: "EXPECTED" },
  { value: "actual", label: "ACTUAL" },
  { value: "both", label: "EXPECTED and ACTUAL" },
];

const names = (values: string[]) => [{ value: "", label: "" }, ...values.map((v) => ({ value: v, label: v }))];

/** The boxes of one phase of a line: what the grid has under EXPECTED or ACTUAL. */
function PhaseFields({ idPrefix, phase, draft, lookups, onChange }: {
  idPrefix: string;
  phase: Phase;
  draft: PhaseDraft;
  lookups: GridLookups;
  onChange: (change: Partial<PhaseDraft>) => void;
}) {
  const id = (name: string) => `${idPrefix}-${phase}-${name}`;
  return (
    <div className="subsection">
      <h3>{PHASE_TITLE[phase]}</h3>
      <div className="form-grid">
        <Field label="Quantity" htmlFor={id("quantity")}>
          <input id={id("quantity")} className="input small" type="number" min="0" step="0.001" value={draft.quantity} onChange={(e) => onChange({ quantity: e.target.value })} />
        </Field>
        <Field label="Net unit cost" htmlFor={id("cost")}>
          <input id={id("cost")} className="input small" type="number" min="0" step="0.0001" value={draft.unitCost} onChange={(e) => onChange({ unitCost: e.target.value })} />
        </Field>
        <Field label="Cash from" htmlFor={id("fund")}>
          <SearchSelect id={id("fund")} value={draft.fund} onChange={(fund) => onChange({ fund })} choices={names(lookups.funds[phase].map((f) => f.name))} />
        </Field>
        <Field label="Bought from" htmlFor={id("supplier")}>
          <SearchSelect id={id("supplier")} value={draft.supplier} onChange={(supplier) => onChange({ supplier })} choices={names(lookups.supplierNames)} />
        </Field>
        {choosesOwnRate(draft.fund, lookups) && (
          <Field label="VAT %" htmlFor={id("vat")}>
            <select id={id("vat")} className="input small" value={draft.vatRate} onChange={(e) => onChange({ vatRate: e.target.value })}>
              <option value="">Choose…</option>
              {lookups.vatRates.map((r) => <option key={r} value={r}>{r}%</option>)}
            </select>
          </Field>
        )}
        <Field label="Purchase date (today if empty)" htmlFor={id("purchase")}>
          <input id={id("purchase")} className="input small" type="date" value={draft.purchaseDate} onChange={(e) => onChange({ purchaseDate: e.target.value })} />
        </Field>
        <Field label="Arrival date (optional)" htmlFor={id("arrival")}>
          <input id={id("arrival")} className="input small" type="date" value={draft.arrivalDate} onChange={(e) => onChange({ arrivalDate: e.target.value })} />
        </Field>
      </div>
    </div>
  );
}

/** The form of a new line of a project, opened from the yellow «Add item» under its grid: only the name is needed. */
export function NewLine({ project, lookups, onDone }: { project: { id: number; name: string }; lookups: GridLookups; onDone: () => void }) {
  const act = useAction();
  const idPrefix = useId();
  const [today] = useState(() => todayIso());
  const [draft, setDraft] = useState<LineDraft>(() => newLineDraft(today));
  const change = (patch: Partial<LineDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const changePhase = (phase: Phase) => (patch: Partial<PhaseDraft>) => setDraft((d) => ({ ...d, [phase]: { ...d[phase], ...patch } }));

  const submit = async () => {
    if (await act(() => api.createLine(project.id, lineBody(draft, lookups, today)))) onDone();
  };

  return (
    <FormPanel
      title={`New item in ${project.name}`}
      description="Choose what to fill in: EXPECTED, ACTUAL or both. Only the name is needed; what is left empty can be typed in the grid later. A sponsor that gives goods chosen in CASH FROM becomes the BOUGHT FROM too."
      submitLabel="Add item"
      canSubmit={draft.item.trim() !== ""}
      onSubmit={submit}
      onCancel={onDone}
      layout="stack"
    >
      <Field label="Fill in">
        <Chips label="Fill in" value={draft.fillIn} onChange={(fillIn) => change({ fillIn })} options={FILL_IN} />
      </Field>
      <div className="form-grid">
        <Field label="Item" htmlFor={`${idPrefix}-item`}>
          <input id={`${idPrefix}-item`} className="input small" autoFocus maxLength={500} value={draft.item} onChange={(e) => change({ item: e.target.value })} />
        </Field>
        <Field label="Category" htmlFor={`${idPrefix}-category`}>
          <select id={`${idPrefix}-category`} className="input small" value={draft.category} onChange={(e) => change({ category: e.target.value })}>
            <option value="">—</option>
            {lookups.categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Priority" htmlFor={`${idPrefix}-priority`}>
          <select id={`${idPrefix}-priority`} className="input small" value={draft.priority} onChange={(e) => change({ priority: e.target.value })}>
            <option value="">—</option>
            {lookups.priorities.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
      </div>
      {PHASES_OF[draft.fillIn].map((phase) => (
        <PhaseFields key={phase} idPrefix={idPrefix} phase={phase} draft={draft[phase]} lookups={lookups} onChange={changePhase(phase)} />
      ))}
    </FormPanel>
  );
}
