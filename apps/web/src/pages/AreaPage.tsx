import { faCheck, faChevronDown, faChevronRight, faGripVertical, faPen, faTrash, faXmark } from "@fortawesome/free-solid-svg-icons";
import { useQuery } from "@tanstack/react-query";
import type { ColDef } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useEffect, useMemo, useRef, useState, type HTMLAttributes } from "react";
import { useParams } from "react-router";
import { api } from "../api/client";
import type { AreaSheet, CalcLine, Phase } from "../api/types";
import { Button, IconButton } from "../components/Button";
import { Chips } from "../components/Chips";
import { DraftNote } from "../components/DraftNote";
import { useMe } from "../lib/auth";
import { money } from "../lib/format";
import { canEditArea } from "../lib/permissions";
import { orderProjects } from "../lib/projectView";
import { useSeason, useSeasonOpen, useSeasons } from "../lib/season";
import { SCREEN, useMaxWidth } from "../lib/screen";
import { useAction } from "../lib/useAction";
import { useDragOrder } from "../lib/useDragOrder";
import { fieldSetter, useDraft } from "../lib/useDraft";
import { useProjectView } from "../lib/useProjectView";
import { gridTheme } from "../theme/grid";
import { areaColumns, mostStatusIcons, needsMoreFunds, type Commit, type GridLookups, type MoreFunds, type Row, type SubtotalRow } from "./areaColumns";
import { VatReportTable } from "./VatReportTable";
import { useExportBlock } from "../components/ExportBlocks";
import { tableFromGrid } from "../lib/export/table";
import { GridSortHeader } from "../components/GridSortHeader";
import { AddSection, DataTable, Field, FormPanel, Loading, Message, PageHeader, Panel, type Column } from "../components/ui";
import { LineCards } from "./LineCards";
import { NewLine } from "./NewLine";
import { gridCompare } from "../lib/sort";

type SheetProject = AreaSheet["projects"][number];

/** How long the pointer rests on a heading or a cell before its popup shows, in milliseconds. */
const TOOLTIP_DELAY = 1000;

/** One of the six area sheets: projects with their lines, subtotals and the VAT report. */
export function AreaPage() {
  const { code = "" } = useParams();
  const act = useAction();
  const me = useMe();
  const sheet = useQuery({ queryKey: ["sheet", code], queryFn: () => api.sheet(code) });
  const categories = useQuery({ queryKey: ["categories"], queryFn: api.categories });
  const priorities = useQuery({ queryKey: ["priorities"], queryFn: api.priorities });
  const vatRates = useQuery({ queryKey: ["vat-rates"], queryFn: api.vatRates });
  const fundsEstimate = useQuery({ queryKey: ["funds", "estimate"], queryFn: () => api.funds("estimate") });
  const fundsActual = useQuery({ queryKey: ["funds", "actual"], queryFn: () => api.funds("actual") });
  const allFunds = useQuery({ queryKey: ["funds"], queryFn: () => api.funds() });
  const suppliers = useQuery({ queryKey: ["suppliers"], queryFn: api.suppliers });
  const seasons = useSeasons();
  const season = useSeason();
  const seasonOpen = useSeasonOpen();
  // on a phone the grid does not fit: each project is a list of cards, of one phase at a time
  const phone = useMaxWidth(SCREEN.phone);
  const [phase, setPhase] = useState<Phase>("estimate");
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
    };
  }, [categories.data, priorities.data, vatRates.data, fundsEstimate.data, fundsActual.data, allFunds.data, suppliers.data, seasons.data, season]);

  const commit: Commit = (line, patch) => {
    void act(() => api.updateLine(line.id, { version: line.version, ...patch }));
  };
  const removeLine = (line: CalcLine) => {
    if (window.confirm(`Delete "${line.item}"?`)) void act(() => api.deleteLine(line.id));
  };
  // nobody changes the budget of a read-only season
  const canEdit = sheet.data ? canEditArea(me, sheet.data.area.id) && seasonOpen : false;
  // the columns of a project depend on whether a line of it needs another fund (ALSO FROM), so each panel builds its own
  const buildColumns = useMemo(
    () => (lookups ? (moreFunds: MoreFunds, iconsInStatus: number) => areaColumns(lookups, commit, removeLine, canEdit, moreFunds, iconsInStatus) : null),
    [lookups, canEdit], // eslint-disable-line react-hooks/exhaustive-deps
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
          canEdit
            ? phone
              ? "Budget lines by project. Touch a line to change it; amounts are calculated."
              : "Budget lines by project. Click a cell to edit it; amounts are calculated."
            : seasonOpen
              ? "Budget lines by project. You can look but not change this area."
              : "Budget lines by project. This season is read-only: nothing in its budget can be changed."
        }
        add={canEdit ? { label: "New project", draftKey: `new-project:${code}`, form: (close) => <NewProject areaCode={code} onDone={close} /> } : undefined}
        actions={
          shown.length > 1 && (
            <>
              <Button variant="ghost" onClick={() => view.setAll(shownIds, true)} disabled={shownIds.every((id) => view.closed.includes(id))}>Close all</Button>
              <Button variant="ghost" onClick={() => view.setAll(shownIds, false)} disabled={shownIds.every((id) => !view.closed.includes(id))}>Open all</Button>
              {view.order.length > 0 && <Button variant="ghost" onClick={view.resetOrder}>Original order</Button>}
            </>
          )
        }
      />

      {phone && <Chips label="Phase" value={phase} onChange={setPhase} options={[{ value: "estimate", label: "EXPECTED" }, { value: "actual", label: "ACTUAL" }]} />}
      {data.projects.length === 0 && <Message>{canEdit ? "No projects yet: add the first one." : "No projects yet."}</Message>}
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

      <VatReportTable areaCode={code} />

      <AreaTotal total={data.total} />
    </>
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
  const iconsInStatus = mostStatusIcons(project.lines);
  const columns = useMemo(() => buildColumns(more, iconsInStatus), [buildColumns, more.estimate, more.actual, iconsInStatus]); // eslint-disable-line react-hooks/exhaustive-deps
  // a column that appears (or goes away) changes what the others can share: fit them again
  useEffect(() => gridRef.current?.api?.autoSizeAllColumns(true), [columns]);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);
  const [owner, setOwner] = useState(project.ownerName ?? "");

  const save = async () => {
    const ok = await act(() => api.updateProject(project.id, { name: name.trim(), ownerName: owner.trim() || null }));
    if (ok) setEditing(false);
  };
  const remove = () => {
    const count = project.lines.length;
    if (window.confirm(`Delete project "${project.name}" with all its ${count} ${count === 1 ? "line" : "lines"}?`)) {
      void act(() => api.deleteProject(project.id));
    }
  };

  return (
    <Panel
      ref={panel}
      className={[closed ? "project-closed" : "", folded ? "project-folded" : ""].filter(Boolean).join(" ") || undefined}
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
              {/* closed, the figures of the subtotal are in the heading: the grid's own are to the right, past the columns of the lines */}
              {closed && (
                <span className="muted" title="What the team pays out of its own money (the subtotal row, OUTFLOW)">
                  Outflow: expected {money(project.subtotal.estimate.outflowCents)} · actual {money(project.subtotal.actual.outflowCents)}
                </span>
              )}
            </>
          )}
          <span className="spacer" />
          {canEdit && <IconButton icon={faTrash} label="Delete project" danger onClick={remove} />}
        </>
      }
    >

      {cards ? (
        <LineCards project={project} phase={cards.phase} lookups={lookups} canEdit={canEdit} onRemove={cards.onRemove} closed={closed} />
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

      {canEdit && !closed && <AddSection label="Add item" draftKey={`new-line:${project.id}`} form={(close) => <NewLine project={project} lookups={lookups} onDone={close} />} />}
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
    if (await act(() => api.createProject({ areaCode, name: name.trim(), ownerName: owner.trim() || null }))) {
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
    <Panel>
      <p className="muted">The VAT here is only what the team pays out of its own money (its fund, the counter-invoice of goods from a sponsor): the VAT that a fund covers is not counted.</p>
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
