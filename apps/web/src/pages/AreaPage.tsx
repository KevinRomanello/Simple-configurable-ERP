import { faCheck, faPen, faTrash, faXmark } from "@fortawesome/free-solid-svg-icons";
import { useQuery } from "@tanstack/react-query";
import type { ColDef } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router";
import { api } from "../api/client";
import type { AreaSheet, CalcLine, Phase } from "../api/types";
import { IconButton } from "../components/Button";
import { useMe } from "../lib/auth";
import { money } from "../lib/format";
import { canEditArea } from "../lib/permissions";
import { useAction } from "../lib/useAction";
import { gridTheme } from "../theme/grid";
import { areaColumns, needsMoreFunds, type Commit, type GridLookups, type MoreFunds, type Row, type SubtotalRow } from "./areaColumns";
import { VatReportTable } from "./VatReportTable";
import { useExportBlock } from "../components/ExportBlocks";
import { tableFromGrid } from "../lib/export/table";
import { GridSortHeader } from "../components/GridSortHeader";
import { AddSection, DataTable, Field, FormPanel, Loading, Message, PageHeader, Panel, type Column } from "../components/ui";
import { NewLine } from "./NewLine";
import { gridCompare } from "../lib/sort";

type SheetProject = AreaSheet["projects"][number];

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

  const lookups = useMemo<GridLookups | null>(() => {
    if (!categories.data || !priorities.data || !vatRates.data || !fundsEstimate.data || !fundsActual.data || !allFunds.data || !suppliers.data) {
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
    };
  }, [categories.data, priorities.data, vatRates.data, fundsEstimate.data, fundsActual.data, allFunds.data, suppliers.data]);

  const commit: Commit = (line, patch) => {
    void act(() => api.updateLine(line.id, { version: line.version, ...patch }));
  };
  const removeLine = (line: CalcLine) => {
    if (window.confirm(`Delete "${line.item}"?`)) void act(() => api.deleteLine(line.id));
  };
  const canEdit = sheet.data ? canEditArea(me, sheet.data.area.id) : false;
  // the columns of a project depend on whether a line of it needs another fund (ALSO FROM), so each panel builds its own
  const buildColumns = useMemo(
    () => (lookups ? (moreFunds: MoreFunds) => areaColumns(lookups, commit, removeLine, canEdit, moreFunds) : null),
    [lookups, canEdit], // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (sheet.isError) return <Message>Area not found.</Message>;
  if (!sheet.data || !lookups || !buildColumns) return <Loading />;
  const data = sheet.data;

  return (
    <>
      <PageHeader
        title={data.area.name}
        description={
          canEdit
            ? "Budget lines by project. Click a cell to edit it; amounts are calculated."
            : "Budget lines by project. You can look but not change this area."
        }
        add={canEdit ? { label: "New project", form: (close) => <NewProject areaCode={code} onDone={close} /> } : undefined}
      />

      {data.projects.length === 0 && <Message>{canEdit ? "No projects yet: add the first one." : "No projects yet."}</Message>}
      {data.projects.map((project) => (
        <ProjectPanel key={project.id} project={project} buildColumns={buildColumns} canEdit={canEdit} lookups={lookups} />
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

function ProjectPanel({ project, buildColumns, canEdit, lookups }: {
  project: SheetProject;
  buildColumns: (moreFunds: MoreFunds) => ReturnType<typeof areaColumns>;
  canEdit: boolean;
  lookups: GridLookups;
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
  const columns = useMemo(() => buildColumns(more), [buildColumns, more.estimate, more.actual]); // eslint-disable-line react-hooks/exhaustive-deps
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
              <h2>{project.name}</h2>
              {project.ownerName && <span className="owner">{project.ownerName}</span>}
              {canEdit && <IconButton icon={faPen} label="Rename project" onClick={() => setEditing(true)} />}
            </>
          )}
          <span className="spacer" />
          {canEdit && <IconButton icon={faTrash} label="Delete project" danger onClick={remove} />}
        </>
      }
    >

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
        tooltipShowDelay={150}
        stopEditingWhenCellsLoseFocus
        singleClickEdit
      />

      {canEdit && <AddSection label="Add item" form={(close) => <NewLine project={project} lookups={lookups} onDone={close} />} />}
    </Panel>
  );
}

/** The form to add a project to the area, opened from the header. */
function NewProject({ areaCode, onDone }: { areaCode: string; onDone: () => void }) {
  const act = useAction();
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");

  const submit = async () => {
    if (await act(() => api.createProject({ areaCode, name: name.trim(), ownerName: owner.trim() || null }))) onDone();
  };

  return (
    <FormPanel title="New project" submitLabel="Add project" canSubmit={name.trim() !== ""} onSubmit={submit} onCancel={onDone}>
      <Field label="Name" htmlFor="project-name">
        <input id="project-name" className="input small" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Owner" htmlFor="project-owner">
        <input id="project-owner" className="input small" value={owner} placeholder="Optional" onChange={(e) => setOwner(e.target.value)} />
      </Field>
    </FormPanel>
  );
}

type Amounts = AreaSheet["total"]["estimate"];

const TOTAL_COLUMNS: Column<{ label: string; amounts: Amounts }>[] = [
  { key: "label", header: "TOTAL", cellClass: () => "bold", cell: (r) => r.label },
  { key: "net", header: "NET COST", num: true, cell: (r) => money(r.amounts.netCents) },
  { key: "vat", header: "VAT (TEAM)", num: true, cell: (r) => money(r.amounts.teamVatCents) },
  { key: "gross", header: "GRAND TOTAL", num: true, cell: (r) => money(r.amounts.grossCents) },
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
