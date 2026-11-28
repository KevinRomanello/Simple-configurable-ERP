import { useState } from "react";
import { platformApi } from "./api";
import type { Season } from "./types";
import { CommitInput } from "../core/CommitInput";
import { DraftNote } from "../core/DraftNote";
import { AddSection, DataTable, Field, FormPanel, Panel, type Column } from "../core/ui";
import { date } from "../core/format";
import { useSeasons } from "./season";
import { useAction } from "../core/useAction";
import { fieldSetter, useDraft } from "../core/useDraft";

// Settings › Seasons and cars (admins): each season is a budget and the car the team builds in it.
// Not designed in Figma: built like the other lists of Settings. docs/stagioni-anni-fiscali-e-macchine.md

/** The form of a new season: the year it starts in (September) and its car. It starts from the latest season. */
function NewSeason({ seasons, onDone }: { seasons: Season[]; onDone: () => void }) {
  const act = useAction();
  const latest = Math.max(...seasons.map((s) => Number(s.startsOn.slice(0, 4))));
  const [initial] = useState(() => ({ year: String(latest + 1), car: "" }));
  const [form, setForm, saved] = useDraft("new-season", initial);
  const { year, car } = form;
  const set = fieldSetter(setForm);
  const startYear = Number(year);
  const valid = Number.isInteger(startYear) && startYear >= 2000 && startYear <= 2100 && car.trim() !== "";
  const submit = async () => {
    if (await act(() => platformApi.createSeason({ startYear, car: car.trim() }))) {
      saved.discard();
      onDone();
    }
  };
  return (
    <FormPanel title="New season" submitLabel="Add season" canSubmit={valid} onSubmit={submit} onCancel={() => saved.leave(onDone)}>
      <DraftNote draft={saved} />
      <Field label="Starts in September of" htmlFor="new-season-year">
        <input id="new-season-year" className="input small" type="number" min="2000" max="2100" step="1" autoFocus value={year} onChange={(e) => set("year")(e.target.value)} />
      </Field>
      <Field label="Car" htmlFor="new-season-car">
        <input id="new-season-car" className="input small" maxLength={60} value={car} onChange={(e) => set("car")(e.target.value)} />
      </Field>
    </FormPanel>
  );
}

export function SeasonsPanel() {
  const act = useAction();
  const seasons = useSeasons().data;

  const columns: Column<Season>[] = [
    { key: "name", header: "SEASON", cellClass: () => "bold", cell: (s) => (s.current ? <>{s.name} <span className="muted">· current</span></> : s.name) },
    { key: "from", header: "FROM", cell: (s) => date(s.startsOn) },
    { key: "to", header: "TO", cell: (s) => date(s.endsOn) },
    { key: "car", header: "CAR", cell: (s) => <CommitInput wide value={s.car} label={`Car of ${s.name}`} onCommit={(car) => car !== "" && act(() => platformApi.updateSeason(s.id, { car }))} /> },
    {
      key: "readOnly",
      header: "READ-ONLY",
      cell: (s) => <input type="checkbox" aria-label={`${s.name} is read-only`} checked={s.readOnly} onChange={(e) => act(() => platformApi.updateSeason(s.id, { readOnly: e.target.checked }))} />,
    },
    { key: "lines", header: "BUDGET LINES", num: true, cell: (s) => s.lines || "" },
  ];

  return (
    <Panel title="Seasons and cars" help={<>
        Each season (1 September - 31 August) has its own budget and the car the team builds in it; the menu chooses the season the whole
        site shows. A line is for the car of its season unless another one is chosen on it. A read-only season can be looked at but its
        budget, sponsors and cash flow cannot be changed. A new season starts from the latest one: the same projects without their
        lines, the same sponsors without their money.
      </>}>
      <DataTable title="Seasons" columns={columns} rows={seasons} rowKey={(s) => s.id} empty="No seasons" />
      {seasons && <AddSection label="New season" draftKey="new-season" form={(close) => <NewSeason seasons={seasons} onDone={close} />} />}
    </Panel>
  );
}
