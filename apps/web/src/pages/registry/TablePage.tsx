import { faArrowUpRightFromSquare, faFileArrowDown, faGear, faLock, faPen, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import type { Filter, Sort } from "@erp/registry";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { CellValueChangedEvent, ColDef, ICellRendererParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useMemo, useState, type CSSProperties } from "react";
import { useParams, useSearchParams } from "react-router";
import { registry, type RegField, type RegRecord, type RegTable, type RegView } from "../../api/registry";
import { Button, IconButton } from "../../components/Button";
import { Chips } from "../../components/Chips";
import { ValueInput, ValueView } from "../../components/registry/Values";
import { Loading, Message, PageHeader, Panel } from "../../components/ui";
import { COMPUTED, GRID_EDITABLE, groupLevels, recordsQuery, showValue, SUMMARIES } from "../../lib/registry";
import { fileBase, saveFile } from "../../lib/export/files";
import { recordsAsXlsx } from "../../lib/registrySheet";
import { todayIso } from "../../lib/today";
import { useAction } from "../../lib/useAction";
import { gridTheme } from "../../theme/grid";
import { ManagePanels, type ManageTab } from "./ManagePanels";
import { CalendarView, Gallery, Kanban, MapView, Timeline } from "./Boards";
import { RecordPanel } from "./RecordPanel";
import { FieldsChooser, FilterEditor, sortParam, SortEditor } from "./ViewTools";

/**
 * A table of the registry, as simple as NocoDB: the views as tabs, a search, a filter, sorts, the fields to show and
 * a group; the grid changes the simple values in place, a row opens the whole record at the side. Who manages the
 * table also gets its fields, views, forms, rules and webhooks (docs/anagrafiche.md, §11). Not designed in Figma:
 * built from the models of the interface.
 */
export function TablePage() {
  const tableId = Number(useParams().table);
  const table = useQuery({ queryKey: ["registry-table", tableId], queryFn: () => registry.table(tableId) });
  if (table.error) return <Message>{table.error.message}</Message>;
  if (!table.data) return <Loading />;
  return <TableView key={tableId} table={table.data} />;
}

type Tool = "filter" | "sort" | "fields" | "group" | "summary" | null;

/** How tall a row of the grid is (NocoDB's Short, Medium, Tall, Extra). */
const ROW_HEIGHTS = { short: 36, medium: 56, tall: 88, extra: 128 } as const;
/** A colour of the registry used in a style: only a hex code, never anything else written in the view. */
const safeColor = (color: string | null | undefined) => (color && /^#[0-9a-f]{3,8}$/i.test(color) ? color : undefined);

function TableView({ table }: { table: RegTable }) {
  const act = useAction();
  const [params, setParams] = useSearchParams();
  const grids = table.views.filter((v) => v.type !== "form");
  const view: RegView | undefined = grids.find((v) => String(v.id) === params.get("view")) ?? grids[0];
  const manages = table.level === "manage";

  // what the person adds to the view, here only (who manages the table may keep it in the view)
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter | undefined>(undefined);
  const [sorts, setSorts] = useState<Sort[] | null>(null);
  const [hidden, setHidden] = useState<number[] | null>(null);
  const [groupBy, setGroupBy] = useState<number[] | undefined>(undefined);
  const [tool, setTool] = useState<Tool>(null);
  const [manage, setManage] = useState<ManageTab | null>(null);
  // a record may be opened from its link (…?record=12)
  const [open, setOpen] = useState<number | null | "new">(() => (Number(params.get("record")) > 0 ? Number(params.get("record")) : null));
  const [summaries, setSummaries] = useState<{ field: number; fn: string }[]>([]);
  // the rows ticked, grid by grid (each group is a grid of its own)
  const [ticked, setTicked] = useState<Record<string, number[]>>({});
  const selected = Object.values(ticked).flat();
  const [bulk, setBulk] = useState<{ field: number; value: unknown } | null>(null);
  const locked = view?.config.locked === true;

  const effective = {
    sorts: sorts ?? view?.config.sorts ?? [],
    hidden: hidden ?? view?.config.hidden ?? [],
    groupBy: groupBy ?? groupLevels(view?.config.groupBy),
  };
  const query = recordsQuery(view?.id, { filter, q, sort: sorts ? sortParam(sorts) || undefined : undefined, groupBy, aggregate: summaries.map((x) => `${x.fn}:${x.field}`).join(",") || undefined });
  // a kanban makes its columns itself: the records come in one list
  if (view?.type === "kanban") query.delete("groupBy");
  const records = useQuery({ queryKey: ["registry-records", table.id, query.toString()], queryFn: () => registry.records(table.id, query), placeholderData: keepPreviousData });

  const fieldsById = new Map(table.fields.map((f) => [f.id, f]));
  const shownFields = (records.data?.fields ?? []).map((f) => fieldsById.get(f.id)).filter((f): f is RegField => f !== undefined && !effective.hidden.includes(f.id));
  const writable = new Set(table.writable);

  const frozen = view?.config.frozen ?? 0;
  const columns = useMemo<ColDef<RegRecord>[]>(
    () => [
      {
        headerName: "",
        colId: "open",
        width: 44,
        pinned: "left",
        sortable: false,
        cellRenderer: (p: ICellRendererParams<RegRecord>) => p.data && <IconButton icon={faArrowUpRightFromSquare} label="Open the record" onClick={() => setOpen(p.data!.id)} />,
      },
      ...shownFields.map((f, index): ColDef<RegRecord> => {
        const editable = !locked && writable.has(f.id) && GRID_EDITABLE.includes(f.type);
        return {
          colId: String(f.id),
          // the first columns stay still when the grid scrolls sideways ("freeze")
          ...(index < frozen ? { pinned: "left" as const } : {}),
          headerName: f.name,
          headerTooltip: f.description || undefined,
          width: view?.config.widths?.[String(f.id)] ?? (f.type === "checkbox" || f.type === "rating" ? 110 : 180),
          sortable: false,
          valueGetter: (p) => p.data?.fields[f.name],
          valueFormatter: (p) => showValue(f, p.value),
          cellRenderer: ["link", "attachment", "multiselect", "url", "user", "color", "geodata", "button"].includes(f.type) ? (p: ICellRendererParams<RegRecord>) => <ValueView field={f} value={p.value} /> : undefined,
          editable,
          ...(f.type === "select" ? { cellEditor: "agSelectCellEditor", cellEditorParams: { values: ["", ...(f.options.choices ?? []).map((c) => c.name)] } } : {}),
          ...(f.type === "checkbox" ? { cellEditor: "agCheckboxCellEditor", cellRenderer: "agCheckboxCellRenderer" } : {}),
          ...(f.type === "number" || f.type === "rating" ? { cellEditor: "agNumberCellEditor" } : {}),
          ...(f.type === "date" ? { cellEditor: "agDateStringCellEditor" } : {}),
          valueSetter: (p) => {
            if (!p.data) return false;
            p.data.fields = { ...p.data.fields, [f.name]: p.newValue };
            return true;
          },
        };
      }),
    ],
    [shownFields.map((f) => f.id).join(","), table, view?.id, frozen, locked],
  );

  const changeCell = (event: CellValueChangedEvent<RegRecord>) => {
    const field = fieldsById.get(Number(event.colDef.colId));
    if (!field || !event.data) return;
    void act(() => registry.updateRecord(table.id, event.data!.id, { [field.name]: event.newValue === "" ? null : event.newValue }, event.data!.version));
  };

  // a group is a grid of its own, like the projects of an area; the server sends the records group by group
  // (with more levels, each group says the value of every level: "SW › In trial")
  const groups = records.data?.groups;
  const parts: { key: string; rows: RegRecord[]; summary?: string }[] = [];
  if (groups && records.data) {
    let at = 0;
    for (const g of groups) {
      // the summaries asked for, of this group only (NocoDB's group aggregations)
      const summary = g.aggregates?.map((a) => `${SUMMARIES.find((x) => x.fn === a.fn)?.label ?? a.fn} of ${a.field}: ${a.value ?? "—"}`).join(" · ");
      parts.push({ key: (g.keys ?? [g.key]).map((k) => k || "(empty)").join(" › "), rows: records.data.records.slice(at, at + g.count), summary });
      at += g.count;
    }
  } else parts.push({ key: "", rows: records.data?.records ?? [] });

  const levels = effective.groupBy;
  const saveToView = () =>
    view &&
    act(() =>
      registry.updateView(view.id, {
        config: { ...view.config, filter: combined(view.config.filter, filter), sorts: effective.sorts, hidden: effective.hidden, groupBy: levels.length === 0 ? undefined : levels.length === 1 ? levels[0] : levels },
      }),
    );

  // the files of what the person sees: CSV and JSON from the server, Excel made here, a calendar for a view of dates
  const downloadXlsx = async () => {
    const rows = await registry.exportJson(table.id, query);
    const columns = shownFields.map((f) => ({ name: f.name, numeric: ["number", "rating", "rollup", "autonumber"].includes(f.type) }));
    const blob = await recordsAsXlsx(table.name, columns, rows.map((r) => shownFields.map((f) => showValue(f, r.fields[f.name]))));
    saveFile(blob, `${fileBase(table.name, todayIso())}.xlsx`);
  };
  const removeSelected = async () => {
    if (window.confirm(`Delete the ${selected.length} records chosen? Their links and files go with them.`) && (await act(() => registry.bulkDelete(table.id, selected)))) setTicked({});
  };
  const changeSelected = async () => {
    const field = bulk && fieldsById.get(bulk.field);
    if (field && (await act(() => registry.bulkUpdate(table.id, selected, { [field.name]: bulk.value })))) {
      setBulk(null);
      setTicked({});
    }
  };
  const bulkFields = table.fields.filter((f) => writable.has(f.id) && !COMPUTED.includes(f.type) && !["attachment", "link"].includes(f.type));

  const grid = (rows: RegRecord[], key: string) => (
    <AgGridReact<RegRecord>
      theme={gridTheme}
      domLayout={rows.length > 30 ? "normal" : "autoHeight"}
      className={rows.length > 30 ? "registry-grid tall" : "registry-grid"}
      rowData={rows}
      columnDefs={columns}
      getRowId={(p) => String(p.data.id)}
      rowHeight={ROW_HEIGHTS[view?.config.rowHeight ?? "short"]}
      getRowStyle={(p) => {
        const color = safeColor(p.data?.color);
        return color ? ({ background: `color-mix(in srgb, ${color} 28%, transparent)` } as CSSProperties as never) : undefined;
      }}
      rowSelection={records.data?.canCreate ? { mode: "multiRow", checkboxes: true, headerCheckbox: true } : undefined}
      selectionColumnDef={{ pinned: "left", width: 44, sortable: false, suppressHeaderMenuButton: true }}
      onSelectionChanged={(e) => {
        const ids = e.api.getSelectedRows().map((r) => r.id);
        setTicked((now) => (JSON.stringify(now[key] ?? []) === JSON.stringify(ids) ? now : { ...now, [key]: ids }));
      }}
      onCellValueChanged={changeCell}
      onColumnResized={(e) => {
        if (!manages || !view || locked || !e.finished || !e.column) return;
        const widths = { ...(view.config.widths ?? {}), [e.column.getColId()]: Math.round(e.column.getActualWidth()) };
        void registry.updateView(view.id, { config: { ...view.config, widths } });
      }}
      singleClickEdit
      stopEditingWhenCellsLoseFocus
      popupParent={document.querySelector<HTMLElement>("main.main")}
      suppressNoRowsOverlay
    />
  );

  return (
    <div className={open !== null ? "with-record" : undefined}>
      <PageHeader
        title={`${table.icon ? `${table.icon} ` : ""}${table.name}`}
        description={table.description || (table.section ? `Registry › ${table.section}` : "Registry")}
        actions={
          <>
            {records.data?.canCreate && <Button icon={faPlus} onClick={() => setOpen("new")}>New record</Button>}
            <a className="btn ghost" href={registry.exportUrl(table.id, query)} download>
              <FontAwesomeIcon icon={faFileArrowDown} /> CSV
            </a>
            <a className="btn ghost" href={registry.exportUrl(table.id, query, "json")} download>JSON</a>
            <Button variant="ghost" onClick={() => act(downloadXlsx)}>Excel</Button>
            {view?.config.dateField !== undefined && <a className="btn ghost" href={registry.exportUrl(table.id, query, "ics")} download>Calendar (.ics)</a>}
            {manages && <Button variant="ghost" icon={faGear} onClick={() => setManage(manage ? null : "fields")}>{manage ? "Close settings" : "Table settings"}</Button>}
          </>
        }
      />
      {manage && <ManagePanels table={table} view={view} tab={manage} onTab={setManage} />}

      {grids.length > 1 && (
        // the views without a folder first, then each folder with its name
        <nav className="toggle-row" aria-label="Views">
          {[...new Set(grids.map((v) => v.config.folder ?? ""))].sort((a, b) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b))).map((folder) => (
            <span key={folder} className="toggle-row">
              {folder && <span className="view-folder">{folder}</span>}
              {grids.filter((v) => (v.config.folder ?? "") === folder).map((v) => (
                <button key={v.id} type="button" className={`chip${v.id === view?.id ? " on" : ""}`} title={v.config.description} onClick={() => { setParams({ view: String(v.id) }); setFilter(undefined); setSorts(null); setHidden(null); setGroupBy(undefined); }}>
                  {v.config.locked && <FontAwesomeIcon icon={faLock} aria-label="locked" />} {v.name}{v.type !== "grid" ? ` · ${v.type}` : ""}{v.config.group ? " · group" : ""}
                </button>
              ))}
            </span>
          ))}
        </nav>
      )}

      <Panel
        title={`${records.data?.total ?? "…"} records`}
        actions={
          <div className="inline-form">
            <input className="input small" type="search" placeholder="Search" aria-label="Search the records" value={q} onChange={(e) => setQ(e.target.value)} />
            <Chips
              label="Tools of the view"
              value={tool ?? ("none" as never)}
              onChange={(t) => setTool(t === tool ? null : t)}
              options={[
                { value: "filter", label: `Filter${filter?.items.length ? ` (${filter.items.length})` : ""}` },
                { value: "sort", label: `Sort${effective.sorts.length ? ` (${effective.sorts.length})` : ""}` },
                { value: "fields", label: "Fields" },
                { value: "group", label: "Group" },
                { value: "summary", label: `Summary${summaries.length ? ` (${summaries.length})` : ""}` },
              ]}
            />
            {manages && !locked && (filter || sorts || hidden || groupBy !== undefined) && <Button small variant="ghost" onClick={saveToView}>Keep in the view</Button>}
            {locked && <span className="label-s muted" title="Somebody who manages the table can unlock it in the settings of the view"><FontAwesomeIcon icon={faLock} /> Locked view</span>}
          </div>
        }
      >
        {tool === "filter" && <FilterEditor idPrefix="table-filter" fields={table.fields} filter={filter} onChange={setFilter} />}
        {tool === "sort" && <SortEditor fields={table.fields} sorts={effective.sorts} onChange={setSorts} />}
        {tool === "fields" && <FieldsChooser fields={(records.data?.fields ?? []).map((f) => fieldsById.get(f.id)).filter((f): f is RegField => f !== undefined)} hidden={effective.hidden} onChange={setHidden} />}
        {tool === "group" && (
          // up to five levels, the outer one first, as NocoDB
          <div className="inline-form">
            {[...levels, null].slice(0, 5).map((level, i) => (
              <select key={i} className="input small" aria-label={`Group by, level ${i + 1}`} value={level ?? ""} onChange={(e) => setGroupBy(e.target.value === "" ? levels.slice(0, i) : [...levels.slice(0, i), Number(e.target.value)])}>
                <option value="">{i === 0 ? "No groups" : "Then by…"}</option>
                {table.fields.filter((f) => ["select", "multiselect", "checkbox", "link", "user", "text", "lookup", "formula", "rating", "date", "number"].includes(f.type) && !levels.slice(0, i).includes(f.id)).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            ))}
          </div>
        )}
        {selected.length > 0 && (
          <div className="inline-form">
            <strong>{selected.length} chosen</strong>
            {bulk ? (
              <>
                <select className="input small" aria-label="Field to change" value={bulk.field} onChange={(e) => setBulk({ field: Number(e.target.value), value: null })}>
                  {bulkFields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                {fieldsById.get(bulk.field) && <ValueInput id="bulk-value" field={fieldsById.get(bulk.field)!} value={bulk.value} onChange={(value) => setBulk({ ...bulk, value })} />}
                <Button small onClick={changeSelected}>Change them</Button>
                <Button small variant="ghost" onClick={() => setBulk(null)}>Cancel</Button>
              </>
            ) : (
              bulkFields.length > 0 && <Button small variant="ghost" icon={faPen} onClick={() => setBulk({ field: bulkFields[0]!.id, value: null })}>Change a field of all</Button>
            )}
            <Button small variant="ghost" icon={faTrash} onClick={removeSelected}>Delete them</Button>
          </div>
        )}
        {tool === "summary" && (
          <div className="stack tight">
            {summaries.map((x, i) => (
              <div key={i} className="inline-form">
                <select className="input small" aria-label="Summary" value={x.fn} onChange={(e) => setSummaries(summaries.map((y, k) => (k === i ? { ...y, fn: e.target.value } : y)))}>
                  {SUMMARIES.map((s) => <option key={s.fn} value={s.fn}>{s.label}</option>)}
                </select>
                of
                <select className="input small" aria-label="Field" value={x.field} onChange={(e) => setSummaries(summaries.map((y, k) => (k === i ? { ...y, field: Number(e.target.value) } : y)))}>
                  {shownFields.filter((f) => !["button"].includes(f.type)).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                <strong>= {String(records.data?.aggregates?.[i]?.value ?? "…")}</strong>
                <IconButton icon={faTrash} label="Remove the summary" onClick={() => setSummaries(summaries.filter((_, k) => k !== i))} />
              </div>
            ))}
            {shownFields.length > 0 && <div><Button small variant="ghost" icon={faPlus} onClick={() => setSummaries([...summaries, { fn: "count", field: shownFields[0]!.id }])}>Add a summary</Button></div>}
          </div>
        )}
        {tool !== "summary" && summaries.length > 0 && records.data?.aggregates && (
          <p className="hint">{records.data.aggregates.map((a) => `${SUMMARIES.find((s) => s.fn === a.fn)?.label ?? a.fn} of ${a.field}: ${a.value ?? "—"}`).join(" · ")}</p>
        )}
        {records.error && <Message>{records.error.message}</Message>}
        {!records.data && !records.error && <Loading />}
        {records.data && records.data.total === 0 && <p className="empty">No records{filter || q ? " match" : " yet"}.</p>}
      </Panel>

      {records.data && records.data.total > 0 && view && view.type === "gallery" && (
        <Panel><Gallery table={table} view={view} records={records.data.records} fields={shownFields} onOpen={setOpen} /></Panel>
      )}
      {records.data && records.data.total > 0 && view && view.type === "kanban" && (
        <Panel><Kanban table={table} view={view} records={records.data.records} fields={shownFields} onOpen={setOpen} /></Panel>
      )}
      {records.data && records.data.total > 0 && view && view.type === "calendar" && (
        <Panel><CalendarView table={table} view={view} records={records.data.records} onOpen={setOpen} /></Panel>
      )}
      {records.data && records.data.total > 0 && view && view.type === "timeline" && (
        <Panel><Timeline table={table} view={view} records={records.data.records} onOpen={setOpen} /></Panel>
      )}
      {records.data && records.data.total > 0 && view && view.type === "map" && (
        <Panel><MapView table={table} view={view} records={records.data.records} onOpen={setOpen} /></Panel>
      )}
      {records.data && records.data.total > 0 && (!view || view.type === "grid") &&
        parts.map((part) =>
          groups ? (
            <Panel key={part.key} title={`${part.key || "(empty)"} · ${part.rows.length}`}>
              {part.summary && <p className="hint">{part.summary}</p>}
              {grid(part.rows, part.key || "all")}
            </Panel>
          ) : (
            <Panel key="all">{grid(part.rows, part.key || "all")}</Panel>
          ),
        )}

      {open !== null && <RecordPanel table={table} recordId={open === "new" ? null : open} onClose={() => setOpen(null)} onCreated={(id) => setOpen(id)} />}
    </div>
  );
}

/** The filter of the view with the conditions the person added, kept together. */
function combined(own: Filter | undefined, extra: Filter | undefined): Filter | undefined {
  if (!extra || extra.items.length === 0) return own;
  if (!own || own.items.length === 0) return extra;
  return { join: "and", items: [own, extra] };
}
