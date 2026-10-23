import { faCheck, faPen, faPlus, faTrash, faXmark } from "@fortawesome/free-solid-svg-icons";
import { useQuery } from "@tanstack/react-query";
import { AgGridReact } from "ag-grid-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useParams } from "react-router";
import { api } from "../api/client";
import type { AreaSheet, CalcLine, Phase } from "../api/types";
import { Button, IconButton } from "../components/Button";
import { useMe } from "../lib/auth";
import { money } from "../lib/format";
import { canEditArea } from "../lib/permissions";
import { useAction } from "../lib/useAction";
import { gridTheme } from "../theme/grid";
import { areaColumns, needsMoreFunds, type Commit, type GridLookups, type MoreFunds, type Row, type SubtotalRow } from "./areaColumns";
import { VatReportTable } from "./VatReportTable";
import { TableBox, useExportBlock } from "../components/ExportBlocks";
import { tableFromGrid } from "../lib/export/table";
import { DownloadMenu } from "../components/DownloadMenu";
import { GridSortHeader } from "../components/GridSortHeader";
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
  const [adding, setAdding] = useState(false);

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

  if (sheet.isError) return <p className="empty">Area not found.</p>;
  if (!sheet.data || !lookups || !buildColumns) return <p className="empty">Loading…</p>;
  const data = sheet.data;

  return (
    <>
      <header className="page-header">
        <div>
          <h1>{data.area.name}</h1>
          <p className="muted">
            {canEdit
              ? "Budget lines by project. Click a cell to edit it; amounts are calculated."
              : "Budget lines by project. You can look but not change this area."}
          </p>
        </div>
        <div className="actions">
          {canEdit && <Button icon={faPlus} onClick={() => setAdding(!adding)}>{adding ? "Close" : "New project"}</Button>}
          <DownloadMenu />
        </div>
      </header>

      {adding && <NewProject areaCode={code} onDone={() => setAdding(false)} />}

      <AreaTotal total={data.total} />

      {data.projects.length === 0 && <p className="empty">{canEdit ? "No projects yet: add the first one." : "No projects yet."}</p>}
      {data.projects.map((project) => (
        <ProjectPanel key={project.id} project={project} buildColumns={buildColumns} canEdit={canEdit} />
      ))}

      <VatReportTable areaCode={code} />
    </>
  );
}

function subtotalRow(project: SheetProject): SubtotalRow {
  const phase = (which: Phase) => ({
    amounts: { ...project.subtotal[which], complete: true },
    teamVatCents: project.lines.reduce((sum, l) => sum + l[which].teamVatCents, 0),
    figures: null,
  });
  return { isSubtotal: true, item: "Subtotal", estimate: phase("estimate"), actual: phase("actual") };
}

function ProjectPanel({ project, buildColumns, canEdit }: { project: SheetProject; buildColumns: (moreFunds: MoreFunds) => ReturnType<typeof areaColumns>; canEdit: boolean }) {
  const act = useAction();
  const gridRef = useRef<AgGridReact<Row>>(null);
  const panel = useRef<HTMLElement>(null);
  useExportBlock({
    title: project.name,
    kind: "table",
    element: () => panel.current,
    collect: () => (gridRef.current?.api ? { kind: "table", table: tableFromGrid(gridRef.current.api) } : null),
  });
  const more = needsMoreFunds(project.lines);
  const columns = useMemo(() => buildColumns(more), [buildColumns, more.estimate, more.actual]); // eslint-disable-line react-hooks/exhaustive-deps
  // a column that appears (or goes away) changes what the others can share: fit them again
  useEffect(() => gridRef.current?.api?.autoSizeAllColumns(true), [columns]);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);
  const [owner, setOwner] = useState(project.ownerName ?? "");
  const [newItem, setNewItem] = useState("");

  const save = async () => {
    const ok = await act(() => api.updateProject(project.id, { name: name.trim(), ownerName: owner.trim() || null }));
    if (ok) setEditing(false);
  };
  const addLine = async (event: FormEvent) => {
    event.preventDefault();
    if (newItem.trim() === "") return;
    if (await act(() => api.createLine(project.id, newItem.trim()))) setNewItem("");
  };
  const remove = () => {
    const count = project.lines.length;
    if (window.confirm(`Delete project "${project.name}" with all its ${count} ${count === 1 ? "line" : "lines"}?`)) {
      void act(() => api.deleteProject(project.id));
    }
  };

  return (
    <section ref={panel} className="panel">
      <div className="panel-head">
        {editing ? (
          <>
            <input className="input small" style={{ maxWidth: 260 }} value={name} onChange={(e) => setName(e.target.value)} aria-label="Project name" />
            <input className="input small" style={{ maxWidth: 220 }} value={owner} placeholder="Owner" onChange={(e) => setOwner(e.target.value)} aria-label="Project owner" />
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
      </div>

      <AgGridReact<Row>
        ref={gridRef}
        theme={gridTheme}
        domLayout="autoHeight"
        rowData={project.lines}
        pinnedBottomRowData={[subtotalRow(project)]}
        columnDefs={columns}
        defaultColDef={{ resizable: true, sortable: true, comparator: (a, b, _x, _y, isDescending) => gridCompare(a, b, isDescending), headerComponent: GridSortHeader, suppressMovable: true, wrapHeaderText: true, autoHeaderHeight: true }}
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

      {canEdit && (
        <form className="inline-form" onSubmit={addLine}>
          <div className="field">
            <input className="input small" value={newItem} placeholder="New item" onChange={(e) => setNewItem(e.target.value)} aria-label={`New item in ${project.name}`} />
          </div>
          <Button small icon={faPlus} type="submit" disabled={newItem.trim() === ""}>Add item</Button>
        </form>
      )}
    </section>
  );
}

/** The form to add a project to the area, opened from the header. */
function NewProject({ areaCode, onDone }: { areaCode: string; onDone: () => void }) {
  const act = useAction();
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === "") return;
    if (await act(() => api.createProject({ areaCode, name: name.trim(), ownerName: owner.trim() || null }))) onDone();
  };

  return (
    <section className="panel">
      <h2>New project</h2>
      <form className="inline-form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="project-name">Name</label>
          <input id="project-name" className="input small" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="project-owner">Owner</label>
          <input id="project-owner" className="input small" value={owner} placeholder="Optional" onChange={(e) => setOwner(e.target.value)} />
        </div>
        <Button small icon={faPlus} type="submit" disabled={name.trim() === ""}>Add project</Button>
        <Button small variant="ghost" onClick={onDone}>Cancel</Button>
      </form>
    </section>
  );
}

function AreaTotal({ total }: { total: AreaSheet["total"] }) {
  const rows = [
    ["EXPECTED", total.estimate],
    ["ACTUAL", total.actual],
  ] as const;
  return (
    <section className="panel">
      <TableBox title="Area total">
        <table className="data-table">
          <thead>
            <tr>
              <th>TOTAL</th>
              <th className="num">NET COST</th>
              <th className="num">VAT</th>
              <th className="num">GRAND TOTAL</th>
              <th className="num">OUTFLOW</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, amounts]) => (
              <tr key={label}>
                <td className="bold">{label}</td>
                <td className="num">{money(amounts.netCents)}</td>
                <td className="num">{money(amounts.vatCents)}</td>
                <td className="num">{money(amounts.grossCents)}</td>
                <td className="num bold">{money(amounts.outflowCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableBox>
    </section>
  );
}
