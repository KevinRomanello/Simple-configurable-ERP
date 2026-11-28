import { faCheck, faChevronDown, faChevronRight, faGripVertical, faPen, faPlus, faTrash, faXmark } from "@fortawesome/free-solid-svg-icons";
import { useQuery } from "@tanstack/react-query";
import type { ColDef } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useEffect, useMemo, useRef, useState, type HTMLAttributes } from "react";
import { useParams } from "react-router";
import { budgetApi } from "./api";
import { platformApi } from "../../platform/api";
import type { AreaSheet, CalcLine, Phase } from "../../core/calcTypes";
import { Button, IconButton } from "../../core/Button";
import { Chips } from "../../core/Chips";
import { DraftNote } from "../../core/DraftNote";
import { DraftGuardContext, useAdder } from "../../core/draftGuard";
import { useMe } from "../../platform/auth";
import { money } from "../../core/format";
import { canEditArea } from "../../platform/permissions";
import { orderProjects } from "./projectView";
import { useSeason, useSeasonOpen, useSeasons } from "../../platform/season";
import { SCREEN, useMaxWidth } from "../../core/screen";
import { useAction } from "../../core/useAction";
import { useDragOrder } from "../../core/useDragOrder";
import { fieldSetter, useDraft } from "../../core/useDraft";
import { usePhaseView, useProjectView, type PhaseView } from "./useProjectView";
import { gridTheme } from "../../theme/grid";
import { areaColumns, mostStatusIcons, needsMoreFunds, withPhases, type Commit, type GridLookups, type MoreFunds, type Row, type SubtotalRow } from "./areaColumns";
import { VatReportTable } from "./VatReportTable";
import { useExportBlock } from "../../core/ExportBlocks";
import { tableFromGrid } from "../../core/export/table";
import { GridSortHeader } from "./GridSortHeader";
import { Card, Cards, DataTable, Field, FormPanel, Loading, Message, PageHeader, Panel, type Column } from "../../core/ui";
import { LineCards } from "./LineCards";
import { NewLine } from "./NewLine";
import { gridCompare } from "../../core/sort";
import { useSlot } from "../../core/slots";
import { arrivals } from "./slots";

type SheetProject = AreaSheet["projects"][number];

/** How long the pointer rests on a heading or a cell before its popup shows, in milliseconds. */
const TOOLTIP_DELAY = 1000;

/** One of the six area sheets: projects with their lines, subtotals and the VAT report. */
export function AreaPage() {
  const { code = "" } = useParams();
  const act = useAction();
  const me = useMe();
  const sheet = useQuery({ queryKey: ["sheet", code], queryFn: () => budgetApi.sheet(code) });
  const categories = useQuery({ queryKey: ["categories"], queryFn: platformApi.categories });
  const priorities = useQuery({ queryKey: ["priorities"], queryFn: budgetApi.priorities });
  const vatRates = useQuery({ queryKey: ["vat-rates"], queryFn: platformApi.vatRates });
  const fundsEstimate = useQuery({ queryKey: ["funds", "estimate"], queryFn: () => budgetApi.funds("estimate") });
  const fundsActual = useQuery({ queryKey: ["funds", "actual"], queryFn: () => budgetApi.funds("actual") });
  const allFunds = useQuery({ queryKey: ["funds"], queryFn: () => budgetApi.funds() });
  const suppliers = useQuery({ queryKey: ["suppliers"], queryFn: budgetApi.suppliers });
  const seasons = useSeasons();
  const season = useSeason();
  const seasonOpen = useSeasonOpen();
  // where the goods are is known only while the inventory is on (its bridge fills the slot)
  const knowsArrivals = useSlot(arrivals).length > 0;
  // on a phone the grid does not fit: each project is a list of cards, of one phase at a time
  const phone = useMaxWidth(SCREEN.phone);
  // the phases the grids show (EXPECTED, ACTUAL or both), remembered in this browser; the cards of a phone show one at a time
  const [phases, setPhases] = usePhaseView();
  const phase: Phase = phases === "actual" ? "actual" : "estimate";
  // which projects this person closed and the order they put them in: kept in this browser
  const view = useProjectView(code);
  const shown = orderProjects(sheet.data?.projects ?? [], view.order);
  const shownIds = shown.map((p) => p.id);
  const drag = useDragOrder(shownIds, view.setOrder, { folds: true });

  const lookups = useMemo<GridLookups | null>(() => {
    if (!categories.data || !priorities.data || !vatRates.data || !fundsEstimate.data || !fundsActual.data || !allFunds.data || !suppliers.data || !seasons.data || !season) {
      return null;
    }
    return {
      categories: categories.data,
      priorities: priorities.data,
      vatRates: vatRates.data,
      funds: { estimate: fundsEstimate.data, actual: fundsActual.data },
      fundById: new Map(allFunds.data.map((f) => [f.id, f])),
      fundByName: new Map(allFunds.data.map((f) => [f.name.toLowerCase(), f])),
      supplierNames: suppliers.data.map((s) => s.name),
      supplierIdByName: new Map(suppliers.data.map((s) => [s.name.toLowerCase(), s.id])),
      cars: seasons.data,
      seasonId: season.id,
      arrivals: knowsArrivals,
    };
  }, [categories.data, priorities.data, vatRates.data, fundsEstimate.data, fundsActual.data, allFunds.data, suppliers.data, seasons.data, season, knowsArrivals]);

  const commit: Commit = (line, patch) => {
    void act(() => budgetApi.updateLine(line.id, { version: line.version, ...patch }));
  };
  const removeLine = (line: CalcLine) => {
    if (window.confirm(`Delete "${line.item}"?`)) void act(() => budgetApi.deleteLine(line.id));
  };
  // nobody changes the budget of a read-only season
  const canEdit = sheet.data ? canEditArea(me, sheet.data.area.id) && seasonOpen : false;
  // the columns of a project depend on whether a line of it needs another fund (ALSO FROM), so each panel builds its own
  const buildColumns = useMemo(
    () => (lookups ? (moreFunds: MoreFunds, iconsInStatus: number) => withPhases(areaColumns(lookups, commit, removeLine, canEdit, moreFunds, iconsInStatus), phases) : null),
    [lookups, canEdit, phases], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // the derived area (what is outside the budget) has no page of its own: it is in TOTAL, the Gantt and the analyses
  if (sheet.isError || sheet.data?.area.derived) return <Message>Area not found.</Message>;
  if (!sheet.data || !lookups || !buildColumns) return <Loading />;
  const data = sheet.data;

  return (
    <>
      <PageHeader
        title={data.area.name}
        description={
          phone
            ? "Budget lines by project, a card per line. Touch a line to change it; amounts are calculated. The figures at the top are the whole area: what the team pays out of its own money (OUTFLOW)."
            : "Budget lines by project. Click a cell to edit it; amounts are calculated. The figures at the top are the whole area: what the team pays out of its own money (OUTFLOW). EXPECTED and ACTUAL can be shown side by side, as in the sheet, or one at a time."
        }
        notice={
          canEdit ? undefined : seasonOpen ? "You can look but not change this area." : "This season is read-only: nothing in its budget can be changed."
        }
        add={canEdit ? { label: "New project", draftKey: `new-project:${code}`, form: (close) => <NewProject areaCode={code} onDone={close} /> } : undefined}
      />

      <AreaFigures total={data.total} />

      <div className="projects">
        <div className="toolbar">
          <Chips
            label="Phases shown"
            value={phone && phases === "both" ? "estimate" : phases}
            onChange={setPhases}
            options={[
              ...(phone ? [] : [{ value: "both" as PhaseView, label: "EXPECTED and ACTUAL" }]),
              { value: "estimate" as PhaseView, label: "EXPECTED" },
              { value: "actual" as PhaseView, label: "ACTUAL" },
            ]}
          />
          {shown.length > 1 && (
            <div className="toolbar-end">
              <Button small variant="ghost" onClick={() => view.setAll(shownIds, true)} disabled={shownIds.every((id) => view.closed.includes(id))}>Close all</Button>
              <Button small variant="ghost" onClick={() => view.setAll(shownIds, false)} disabled={shownIds.every((id) => !view.closed.includes(id))}>Open all</Button>
              {view.order.length > 0 && <Button small variant="ghost" onClick={view.resetOrder}>Original order</Button>}
            </div>
          )}
        </div>
        {data.projects.length === 0 && <Message>{canEdit ? "No projects yet: add the first one with New project." : "No projects yet."}</Message>}
        {shown.map((project) => (
          <div key={project.id} {...drag.boxProps(project.id)} className={`project-box ${drag.classOf(project.id)}`.trim()}>
            <ProjectPanel project={project} buildColumns={buildColumns} canEdit={canEdit} lookups={lookups}
              cards={phone ? { phase, onRemove: removeLine } : null}
              closed={view.closed.includes(project.id)} onToggle={() => view.toggle(project.id)}
              // while one project is in hand every project folds to its heading, so that they all fit on the screen
              folded={drag.draggedId !== null}
              // the handle only when there is something to move
              handle={shown.length > 1 ? drag.handle(project.id) : null} />
          </div>
        ))}
      </div>

      <VatReportTable areaCode={code} />

      <AreaTotal total={data.total} />
    </>
  );
}

/** The whole area at a glance, before its projects: what the team pays out of its own money, expected and actual. */
function AreaFigures({ total }: { total: AreaSheet["total"] }) {
  const figure = (caption: string, amounts: Amounts) => (
    <Card caption={caption} negative={amounts.outflowCents < 0} hint={<span className="hint">net {money(amounts.netCents)} · VAT {money(amounts.teamVatCents)}</span>}>
      {money(amounts.outflowCents)}
    </Card>
  );
  return (
    <Cards>
      {figure("EXPECTED OUTFLOW", total.estimate)}
      {figure("ACTUAL OUTFLOW", total.actual)}
    </Cards>
  );
}

// A constant, like the subtotal row of each project (memoised): objects made again on every render make
// every grid of the page apply its columns again, which froze the browser for 0.4 s after each edit.
const DEFAULT_COL_DEF: ColDef<Row> = {
  resizable: true,
  sortable: true,
  comparator: (a, b, _x, _y, isDescending) => gridCompare(a, b, isDescending),
  headerComponent: GridSortHeader,
  suppressMovable: true,
  wrapHeaderText: true,
  autoHeaderHeight: true,
  // the lists to choose from open right under their cell
  cellEditorPopupPosition: "under",
};

function subtotalRow(project: SheetProject): SubtotalRow {
  // the VAT of a subtotal is the one the team pays: what a fund covers is not counted
  const phase = (which: Phase) => ({
    amounts: { ...project.subtotal[which], vatCents: project.subtotal[which].teamVatCents, complete: true },
    teamVatCents: project.subtotal[which].teamVatCents,
    figures: null,
  });
  return { isSubtotal: true, item: "Subtotal", estimate: phase("estimate"), actual: phase("actual") };
}

function ProjectPanel({ project, buildColumns, canEdit, lookups, cards, closed, onToggle, folded, handle }: {
  project: SheetProject;
  buildColumns: (moreFunds: MoreFunds, iconsInStatus: number) => ReturnType<typeof areaColumns>;
  canEdit: boolean;
  lookups: GridLookups;
  /** On a phone: the lines as cards, of this phase, instead of the grid. */
  cards: { phase: Phase; onRemove: (line: CalcLine) => void } | null;
  /** Closed: only the subtotal shows (the lines stay in the grid, so a download still has them all). */
  closed: boolean;
  onToggle: () => void;
  /** Only the heading shows, because a project is being moved. */
  folded: boolean;
  /** The events of the handle that moves this project in the list this person sees (none when it is the only one). */
  handle: HTMLAttributes<HTMLButtonElement> | null;
}) {
  const act = useAction();
  const gridRef = useRef<AgGridReact<Row>>(null);
  const panel = useRef<HTMLElement>(null);
  useExportBlock({
    title: project.name,
    kind: "table",
    element: () => panel.current,
    collect: () => (gridRef.current?.api ? { kind: "table", table: tableFromGrid(gridRef.current.api) } : null),
  });
  const subtotal = useMemo(() => [subtotalRow(project)], [project]);
  const more = needsMoreFunds(project.lines);
  const iconsInStatus = mostStatusIcons(project.lines, lookups.arrivals);
  const columns = useMemo(() => buildColumns(more, iconsInStatus), [buildColumns, more.estimate, more.actual, iconsInStatus]); // eslint-disable-line react-hooks/exhaustive-deps
  // a column that appears (or goes away) changes what the others can share, and a closed project was not measured: fit them again
  useEffect(() => {
    if (!closed) gridRef.current?.api?.autoSizeAllColumns(true);
  }, [columns, closed]);
  // «Add item» is in the heading of the project, its form under the lines
  const adder = useAdder(`new-line:${project.id}`);
  const empty = project.lines.length === 0;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);
  const [owner, setOwner] = useState(project.ownerName ?? "");

  const save = async () => {
    const ok = await act(() => budgetApi.updateProject(project.id, { name: name.trim(), ownerName: owner.trim() || null }));
    if (ok) setEditing(false);
  };
  const remove = () => {
    const count = project.lines.length;
    if (window.confirm(`Delete project "${project.name}" with all its ${count} ${count === 1 ? "line" : "lines"}?`)) {
      void act(() => budgetApi.deleteProject(project.id));
    }
  };

  return (
    <Panel
      ref={panel}
      className={["project", closed ? "project-closed" : "", folded ? "project-folded" : ""].filter(Boolean).join(" ")}
      head={
        <>
          {editing ? (
            <>
              <input className="input small edit-name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Project name" />
              <input className="input small edit-owner" value={owner} placeholder="Owner" onChange={(e) => setOwner(e.target.value)} aria-label="Project owner" />
              <IconButton icon={faCheck} label="Save" onClick={save} />
              <IconButton icon={faXmark} label="Cancel" onClick={() => setEditing(false)} />
            </>
          ) : (
            <>
              {handle && <IconButton icon={faGripVertical} className="drag-handle" label={`Drag to move ${project.name} (or use the up and down arrow keys)`} {...handle} />}
              <IconButton icon={closed ? faChevronRight : faChevronDown} label={`${closed ? "Open" : "Close"} ${project.name}`} aria-expanded={!closed} onClick={onToggle} />
              <h2>{project.name}</h2>
              {project.ownerName && <span className="owner">{project.ownerName}</span>}
              {canEdit && <IconButton icon={faPen} label="Rename project" onClick={() => setEditing(true)} />}
            </>
          )}
          <span className="spacer" />
          {/* the subtotal of the project, always in sight (what the team pays out of its own money, the OUTFLOW of the subtotal row) */}
          <span className="project-sums" title="What the team pays out of its own money (the subtotal row, OUTFLOW)">
            <span>EXPECTED <strong>{money(project.subtotal.estimate.outflowCents)}</strong></span>
            <span>ACTUAL <strong>{money(project.subtotal.actual.outflowCents)}</strong></span>
          </span>
          {canEdit && !editing && (
            <Button small variant="ghost" icon={faPlus} onClick={() => { if (closed) onToggle(); adder.toggle(); }}>
              {adder.adding && !closed ? "Close" : "Add item"}
            </Button>
          )}
          {canEdit && <IconButton icon={faTrash} label="Delete project" danger onClick={remove} />}
        </>
      }
    >
      {cards ? (
        <LineCards project={project} phase={cards.phase} lookups={lookups} canEdit={canEdit} onRemove={cards.onRemove} closed={closed} />
      ) : empty ? (
        <p className="project-empty">No lines yet{canEdit ? ": Add item writes the first one." : "."}</p>
      ) : (
        <AgGridReact<Row>
          ref={gridRef}
          theme={gridTheme}
          domLayout="autoHeight"
          rowData={project.lines}
          pinnedBottomRowData={subtotal}
          columnDefs={columns}
          defaultColDef={DEFAULT_COL_DEF}
          // The lists of the cells open in the page, under their cell. Not in the grid (it is only as tall as its
          // rows, so a list would be pushed up over the header) and not in <body>: that is only as tall as the
          // window while the page scrolls, so the grid believes there is no room under the cell and opens the list
          // above it as soon as the page has been scrolled. .main is as tall as the page.
          popupParent={document.querySelector<HTMLElement>("main.main")}
          // each column takes the room its content needs, no more; fitted again whenever the rows change
          // (the grid can only measure columns it draws, so all of them are drawn)
          suppressColumnVirtualisation
          autoSizeStrategy={{ type: "fitCellContents", skipHeader: true }}
          onRowDataUpdated={(event) => event.api.autoSizeAllColumns(true)}
          getRowId={(p) => ("isSubtotal" in p.data ? "subtotal" : String(p.data.id))}
          suppressCellFocus={false}
          suppressNoRowsOverlay
          // a popup waits 1 s, also when the pointer comes from another cell that has one (the library's own wait for that is 200 ms)
          tooltipShowDelay={TOOLTIP_DELAY}
          tooltipSwitchShowDelay={TOOLTIP_DELAY}
          stopEditingWhenCellsLoseFocus
          singleClickEdit
        />
      )}

      {canEdit && adder.adding && !closed && (
        <div className="project-add">
          <DraftGuardContext.Provider value={adder.report}>
            <NewLine project={project} lookups={lookups} onDone={adder.hide} />
          </DraftGuardContext.Provider>
        </div>
      )}
    </Panel>
  );
}

/** The form to add a project to the area, opened from the header. */
function NewProject({ areaCode, onDone }: { areaCode: string; onDone: () => void }) {
  const act = useAction();
  const [form, setForm, saved] = useDraft(`new-project:${areaCode}`, { name: "", owner: "" });
  const { name, owner } = form;
  const set = fieldSetter(setForm);

  const submit = async () => {
    if (await act(() => budgetApi.createProject({ areaCode, name: name.trim(), ownerName: owner.trim() || null }))) {
      saved.discard();
      onDone();
    }
  };

  return (
    <FormPanel title="New project" submitLabel="Add project" canSubmit={name.trim() !== ""} onSubmit={submit} onCancel={() => saved.leave(onDone)}>
      <DraftNote draft={saved} />
      <Field label="Name" htmlFor="project-name">
        <input id="project-name" className="input small" value={name} autoFocus onChange={(e) => set("name")(e.target.value)} />
      </Field>
      <Field label="Owner" htmlFor="project-owner">
        <input id="project-owner" className="input small" value={owner} placeholder="Optional" onChange={(e) => set("owner")(e.target.value)} />
      </Field>
    </FormPanel>
  );
}

type Amounts = AreaSheet["total"]["estimate"];

const TOTAL_COLUMNS: Column<{ label: string; amounts: Amounts }>[] = [
  { key: "label", header: "TOTAL", cellClass: () => "bold", cell: (r) => r.label },
  { key: "net", header: "NET COST", num: true, cell: (r) => money(r.amounts.netCents) },
  { key: "vat", header: "VAT (TEAM)", num: true, cell: (r) => money(r.amounts.teamVatCents) },
  { key: "outflow", header: "OUTFLOW", num: true, cellClass: () => "bold", cell: (r) => money(r.amounts.outflowCents) },
];

/** The two lines of the whole area, EXPECTED and ACTUAL. */
function AreaTotal({ total }: { total: AreaSheet["total"] }) {
  return (
    <Panel
      title="Area total"
      help="The VAT here is only what the team pays out of its own money (its fund, the counter-invoice of goods from a sponsor): the VAT that a fund covers is not counted."
    >
      <DataTable
        title="Area total"
        columns={TOTAL_COLUMNS}
        rows={[
          { label: "EXPECTED", amounts: total.estimate },
          { label: "ACTUAL", amounts: total.actual },
        ]}
        rowKey={(r) => r.label}
        rowClass={() => "total"}
      />
    </Panel>
  );
}
