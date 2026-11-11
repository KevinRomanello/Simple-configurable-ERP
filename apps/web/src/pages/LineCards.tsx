import { faTrash } from "@fortawesome/free-solid-svg-icons";
import { useId, useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { AreaSheet, CalcLine, Phase } from "../api/types";
import { ArrivalPill } from "../components/ArrivalPill";
import { Button, IconButton } from "../components/Button";
import { Field, Panel } from "../components/ui";
import { money, moneyE4, quantity } from "../lib/format";
import { editDraft, linePatch, PHASES, severalFunds, type EditDraft } from "../lib/lineEdit";
import type { PhaseDraft } from "../lib/newLine";
import { useAction } from "../lib/useAction";
import { carSeasonOf, type GridLookups } from "./areaColumns";
import { CarField, PhaseFields } from "./NewLine";

// A project of the budget on a phone, where the grid does not fit: one card per line with what
// matters for the phase chosen (EXPECTED or ACTUAL), the yellow subtotal last. Touching a line opens
// the form that changes it, with every box of the grid. docs/stile-interfaccia.md

type SheetProject = AreaSheet["projects"][number];

/** What the card says under the name: quantity × unit cost, category, who pays, who sells. */
function summary(line: CalcLine, phase: Phase): string {
  const calc = line[phase];
  if (!calc.figures) return "Nothing written yet";
  return [
    `${quantity(calc.figures.quantityMilli)} × ${moneyE4(calc.figures.unitGrossE4 != null ? calc.unitPriceE4.gross : calc.unitPriceE4.net)}${calc.figures.unitGrossE4 != null ? " with VAT" : ""}`,
    line.category,
    calc.fundName,
    calc.supplierName && `from ${calc.supplierName}`,
  ].filter(Boolean).join(" · ");
}

export function LineCards({ project, phase, lookups, canEdit, onRemove }: {
  project: SheetProject;
  phase: Phase;
  lookups: GridLookups;
  canEdit: boolean;
  onRemove: (line: CalcLine) => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const subtotal = project.subtotal[phase];
  return (
    <ul className="line-cards">
      {project.lines.map((line) => {
        const calc = line[phase];
        const otherCar = line.carSeasonId === null ? undefined : carSeasonOf(lookups, line);
        const body = (
          <>
            <span className="line-main">
              <strong>{line.item}</strong>
              <span className="muted">{summary(line, phase)}</span>
              {otherCar && <span className="pill car">for {otherCar.car}</span>}
              {line.arrival.status !== "planned" && <ArrivalPill status={line.arrival.status} />}
              {calc.shortCents > 0 && <span className="hint error">The funds miss {money(calc.shortCents)}</span>}
              {calc.paidCents > 0 && <span className="hint">{calc.paidCents >= calc.teamFundCents ? "Paid" : `Paid ${money(calc.paidCents)} of ${money(calc.teamFundCents)}`}</span>}
            </span>
            <span className="line-amount">
              <strong>{money(calc.amounts.grossCents)}</strong>
              <span className="muted">outflow {money(calc.amounts.outflowCents)}</span>
            </span>
          </>
        );
        return (
          <li key={line.id}>
            {canEdit ? (
              <button type="button" className="line-card" aria-expanded={open === line.id} onClick={() => setOpen(open === line.id ? null : line.id)}>
                {body}
              </button>
            ) : (
              <div className="line-card">{body}</div>
            )}
            {open === line.id && <EditLine line={line} lookups={lookups} onDone={() => setOpen(null)} onRemove={() => onRemove(line)} />}
          </li>
        );
      })}
      <li className="line-card total">
        <span className="line-main"><strong>Subtotal</strong></span>
        <span className="line-amount">
          <strong>{money(subtotal.grossCents)}</strong>
          <span>outflow {money(subtotal.outflowCents)}</span>
        </span>
      </li>
    </ul>
  );
}

/** Every box of a line, as it is now; Save sends only what was changed (with the version read, like the grid). */
function EditLine({ line, lookups, onDone, onRemove }: { line: CalcLine; lookups: GridLookups; onDone: () => void; onRemove: () => void }) {
  const act = useAction();
  const idPrefix = useId();
  const [draft, setDraft] = useState<EditDraft>(() => editDraft(line));
  const patch = linePatch(draft, line, lookups);
  const changed = Object.keys(patch).length > 1;
  const change = (part: Partial<EditDraft>) => setDraft((d) => ({ ...d, ...part }));
  const changePhase = (phase: Phase) => (part: Partial<PhaseDraft>) => setDraft((d) => ({ ...d, [phase]: { ...d[phase], ...part } }));

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (await act(() => api.updateLine(line.id, patch))) onDone();
  };

  return (
    <Panel title={`Change ${line.item}`}>
      <form className="stack tight" onSubmit={save}>
        <div className="form-grid">
          <Field label="Item" htmlFor={`${idPrefix}-item`}>
            <input id={`${idPrefix}-item`} className="input small" maxLength={500} value={draft.item} onChange={(e) => change({ item: e.target.value })} />
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
          <CarField id={`${idPrefix}-car`} value={draft.car} lookups={lookups} onChange={(car) => change({ car })} />
        </div>
        {PHASES.map((phase) => (
          <PhaseFields key={phase} idPrefix={idPrefix} phase={phase} draft={draft[phase]} lookups={lookups} onChange={changePhase(phase)}
            fixedFunds={severalFunds(line, phase) ? (line[phase].fundName ?? "") : undefined} />
        ))}
        <div className="actions">
          <Button small type="submit" disabled={!changed || draft.item.trim() === ""}>Save</Button>
          <Button small variant="ghost" onClick={onDone}>Cancel</Button>
          <span className="spacer" />
          <IconButton icon={faTrash} label={`Delete ${line.item}`} danger onClick={onRemove} />
        </div>
      </form>
    </Panel>
  );
}
