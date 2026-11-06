import { useState } from "react";
import { api } from "../api/client";
import type { Season } from "../api/types";
import { CommitInput } from "../components/CommitInput";
import { AddSection, DataTable, Field, FormPanel, Panel, type Column } from "../components/ui";
import { date } from "../lib/format";
import { useSeasons } from "../lib/season";
import { useAction } from "../lib/useAction";

// Settings › Seasons and cars (admins): each season is a budget and the car the team builds in it.
// Not designed in Figma: built like the other lists of Settings. docs/stagioni-anni-fiscali-e-macchine.md

/** The form of a new season: the year it starts in (September) and its car. It starts from the latest season. */
function NewSeason({ seasons, onDone }: { seasons: Season[]; onDone: () => void }) {
  const act = useAction();
  const latest = Math.max(...seasons.map((s) => Number(s.startsOn.slice(0, 4))));
  const [year, setYear] = useState(String(latest + 1));
  const [car, setCar] = useState("");
  const startYear = Number(year);
  const valid = Number.isInteger(startYear) && startYear >= 2000 && startYear <= 2100 && car.trim() !== "";
  const submit = async () => {
    if (await act(() => api.createSeason({ startYear, car: car.trim() }))) onDone();
  };
  return (
    <FormPanel title="New season" submitLabel="Add season" canSubmit={valid} onSubmit={submit} onCancel={onDone}>
      <Field label="Starts in September of" htmlFor="new-season-year">
        <input id="new-season-year" className="input small" type="number" min="2000" max="2100" step="1" autoFocus value={year} onChange={(e) => setYear(e.target.value)} />
      </Field>
      <Field label="Car" htmlFor="new-season-car">
        <input id="new-season-car" className="input small" maxLength={60} value={car} onChange={(e) => setCar(e.target.value)} />
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
    { key: "car", header: "CAR", cell: (s) => <CommitInput wide value={s.car} label={`Car of ${s.name}`} onCommit={(car) => car !== "" && act(() => api.updateSeason(s.id, { car }))} /> },
    {
      key: "readOnly",
      header: "READ-ONLY",
      cell: (s) => <input type="checkbox" aria-label={`${s.name} is read-only`} checked={s.readOnly} onChange={(e) => act(() => api.updateSeason(s.id, { readOnly: e.target.checked }))} />,
    },
    { key: "lines", header: "BUDGET LINES", num: true, cell: (s) => s.lines || "" },
  ];

  return (
    <Panel title="Seasons and cars">
      <p className="muted">
        Each season (1 September - 31 August) has its own budget and the car the team builds in it; the menu chooses the season the whole
        site shows. A line is for the car of its season unless another one is chosen on it. A read-only season can be looked at but its
        budget, sponsors and cash flow cannot be changed. A new season starts from the latest one: the same projects without their
        lines, the same sponsors without their money.
      </p>
      <DataTable title="Seasons" columns={columns} rows={seasons} rowKey={(s) => s.id} empty="No seasons" />
      {seasons && <AddSection label="New season" form={(close) => <NewSeason seasons={seasons} onDone={close} />} />}
    </Panel>
  );
}
