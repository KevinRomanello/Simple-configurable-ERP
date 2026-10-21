import { faCheck, faHourglassHalf, faTrash, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { ColDef, ColGroupDef, ICellRendererParams, ValueSetterParams } from "ag-grid-community";
import type { FiguresPatch, LinePatch } from "../api/client";
import type { CalcLine, Phase, PhaseCalc } from "../api/types";
import { ArrivalPill, arrivalTitle } from "../components/ArrivalPill";
import { date, money, quantity } from "../lib/format";

/** The pinned "yellow row" of a project: same shape as a line, but only results. */
type PhaseView = Partial<PhaseCalc> & Pick<PhaseCalc, "amounts" | "teamVatCents">;
export interface SubtotalRow {
  isSubtotal: true;
  item: string;
  estimate: PhaseView;
  actual: PhaseView;
}
export type Row = CalcLine | SubtotalRow;

/** Everything the dropdowns need. */
export interface GridLookups {
  categories: string[];
  priorities: string[];
  vatRates: number[];
  fundNames: Record<Phase, string[]>;
  fundIdByName: Map<string, number>;
  supplierNames: string[];
  supplierIdByName: Map<string, number>;
}

/** Sends a change of one line to the server (the grid never edits its own data). */
export type Commit = (line: CalcLine, patch: Omit<LinePatch, "version">) => void;

const SPONSOR_LABEL = { none: "No sponsor", partial: "Partial", total: "Total" } as const;
const SPONSOR_BY_LABEL = Object.fromEntries(Object.entries(SPONSOR_LABEL).map(([k, v]) => [v, k]));

const isLine = (row: Row | undefined): row is CalcLine => row !== undefined && !("isSubtotal" in row);
const blank = (value: unknown) => value === "" || value === null || value === undefined;

/** A cell the person can change: calls `commit` instead of writing into the grid. */
function editableCell(
  commit: Commit,
  toPatch: (value: any) => Omit<LinePatch, "version">,
): Pick<ColDef<Row>, "editable" | "valueSetter"> {
  return {
    editable: (p) => isLine(p.data) && !p.node.rowPinned,
    valueSetter: (p: ValueSetterParams<Row>) => {
      if (isLine(p.data)) commit(p.data, toPatch(p.newValue));
      return false; // the screen reloads the real value from the server
    },
  };
}

function phaseColumns(phase: Phase, lookups: GridLookups, commit: Commit): ColDef<Row>[] {
  const fig = (r: Row | undefined) => r?.[phase].figures ?? null;
  const amountsOf = (r: Row | undefined) => r?.[phase].amounts;
  const patchFigures = (patch: FiguresPatch) => ({ figures: { [phase]: patch } });
  const asNumber = (value: unknown) => (blank(value) ? null : Number(value));

  const amountColumn = (
    id: string, headerName: string, pick: (a: PhaseCalc["amounts"]) => number, width = 118, bold = false,
  ): ColDef<Row> => ({
    colId: `${phase}.${id}`,
    headerName,
    width,
    cellClass: "calc",
    // like the old sheet: zero is blank, except for the VAT column
    valueGetter: (p) => {
      const amounts = amountsOf(p.data);
      return amounts ? money(pick(amounts), id !== "vat") : "";
    },
    ...(bold ? { cellStyle: { fontWeight: 700 } } : {}),
  });

  return [
    {
      colId: `${phase}.quantity`,
      headerName: "QTY",
      width: 80,
      cellClass: "num",
      valueGetter: (p) => (fig(p.data) ? fig(p.data)!.quantityMilli / 1000 : null),
      cellEditor: "agNumberCellEditor",
      cellEditorParams: { min: 0, precision: 3 },
      ...editableCell(commit, (v) => patchFigures({ quantity: asNumber(v) })),
    },
    {
      colId: `${phase}.unitNetCost`,
      headerName: "NET UNIT COST",
      width: 120,
      cellClass: "num",
      valueGetter: (p) => (fig(p.data) ? fig(p.data)!.unitCostE4 / 10_000 : null),
      valueFormatter: (p) => (p.value == null ? "" : money(Math.round(p.value * 100))),
      cellEditor: "agNumberCellEditor",
      cellEditorParams: { min: 0, precision: 4 },
      ...editableCell(commit, (v) => patchFigures({ unitNetCost: asNumber(v) })),
    },
    amountColumn("net", "NET COST", (a) => a.netCents),
    amountColumn("vat", "VAT", (a) => a.vatCents, 100),
    {
      colId: `${phase}.fund`,
      headerName: "CASH FROM",
      width: 150,
      valueGetter: (p) => p.data?.[phase].fundName ?? "",
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: ["", ...lookups.fundNames[phase]] },
      ...editableCell(commit, (v) =>
        patchFigures({ fundId: blank(v) ? null : (lookups.fundIdByName.get(String(v).toLowerCase()) ?? null) }),
      ),
    },
    {
      colId: `${phase}.supplier`,
      headerName: "BOUGHT FROM",
      width: 150,
      valueGetter: (p) => p.data?.[phase].supplierName ?? "",
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: ["", ...lookups.supplierNames] },
      ...editableCell(commit, (v) =>
        patchFigures({ supplierId: blank(v) ? null : (lookups.supplierIdByName.get(String(v).toLowerCase()) ?? null) }),
      ),
    },
    {
      colId: `${phase}.sponsorType`,
      headerName: "SPONSOR",
      width: 120,
      valueGetter: (p) => {
        const type = fig(p.data)?.sponsorType;
        return type ? SPONSOR_LABEL[type] : "";
      },
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: ["", ...Object.values(SPONSOR_LABEL)] },
      ...editableCell(commit, (v) => patchFigures({ sponsorType: blank(v) ? null : SPONSOR_BY_LABEL[String(v)] })),
    },
    {
      colId: `${phase}.vatRate`,
      headerName: "VAT %",
      width: 90,
      valueGetter: (p) => {
        const rate = fig(p.data)?.vatRate;
        return rate == null ? "" : `${rate}%`;
      },
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: ["", ...lookups.vatRates.map((r) => `${r}%`)] },
      ...editableCell(commit, (v) => patchFigures({ vatRate: blank(v) ? null : Number(String(v).replace("%", "")) })),
    },
    {
      colId: `${phase}.sponsorValue`,
      headerName: "SPONSOR VALUE",
      width: 130,
      cellClass: "num",
      valueGetter: (p) => {
        const f = fig(p.data);
        return f?.sponsorType === "partial" && f.sponsorValueCents != null ? f.sponsorValueCents / 100 : null;
      },
      valueFormatter: (p) => (p.value == null ? "" : money(Math.round(p.value * 100))),
      cellEditor: "agNumberCellEditor",
      cellEditorParams: { min: 0, precision: 2 },
      // only a partial sponsor has a typed value; for the other types it is derived
      editable: (p) => isLine(p.data) && !p.node.rowPinned && fig(p.data)?.sponsorType === "partial",
      valueSetter: (p) => {
        if (isLine(p.data)) commit(p.data, patchFigures({ sponsorValue: asNumber(p.newValue) }));
        return false;
      },
    },
    amountColumn("gross", "GRAND TOTAL", (a) => a.grossCents),
    amountColumn("outflow", "OUTFLOW", (a) => a.outflowCents, 118, true),
    {
      colId: `${phase}.purchaseDate`,
      headerName: "PURCHASE DATE",
      width: 130,
      valueGetter: (p) => fig(p.data)?.purchaseDate ?? null,
      valueFormatter: (p) => date(p.value),
      cellEditor: "agDateStringCellEditor",
      ...editableCell(commit, (v) => patchFigures({ purchaseDate: blank(v) ? null : String(v) })),
    },
    {
      colId: `${phase}.arrivalDate`,
      headerName: "ARRIVAL DATE",
      width: 125,
      valueGetter: (p) => fig(p.data)?.arrivalDate ?? null,
      valueFormatter: (p) => date(p.value),
      cellEditor: "agDateStringCellEditor",
      ...editableCell(commit, (v) => patchFigures({ arrivalDate: blank(v) ? null : String(v) })),
    },
    {
      colId: `${phase}.teamVat`,
      headerName: "VAT TO PAY",
      width: 115,
      cellClass: "calc",
      valueGetter: (p) => (p.data && p.data[phase].teamVatCents > 0 ? money(p.data[phase].teamVatCents) : ""),
    },
    {
      colId: `${phase}.vatDue`,
      headerName: "VAT DUE",
      width: 100,
      cellClass: "calc",
      valueGetter: (p) => date(p.data?.[phase].vatDueDate),
    },
    // Only what was bought can arrive: the inventory (PENDING) tells how much of it has.
    ...(phase === "actual" ? [arrivalColumn] : []),
  ];
}

const arrivalColumn: ColDef<Row> = {
  colId: "actual.arrival",
  headerName: "ARRIVED",
  width: 150,
  cellClass: "calc",
  valueGetter: (p) => (isLine(p.data) ? `${p.data.arrival.status} ${p.data.arrival.receivedMilli}/${p.data.arrival.boughtMilli}` : ""),
  cellRenderer: (p: ICellRendererParams<Row>) => {
    const arrival = isLine(p.data) ? p.data.arrival : null;
    if (!arrival || arrival.status === "planned") return null;
    return (
      <span style={{ display: "inline-flex", gap: "var(--space-xs)", alignItems: "center" }}>
        <ArrivalPill status={arrival.status} />
        <span className="muted">{quantity(arrival.receivedMilli)}/{quantity(arrival.boughtMilli)}</span>
      </span>
    );
  },
};

type Columns = (ColDef<Row> | ColGroupDef<Row>)[];

/** The same columns for someone who may only look: nothing editable, no delete button. */
function readOnly(columns: Columns): Columns {
  return columns
    .filter((c) => !("colId" in c && c.colId === "remove"))
    .map((c) => ("children" in c ? { ...c, children: readOnly(c.children as Columns) as ColDef<Row>[] } : { ...c, editable: false }));
}

/** The columns of a project grid, in the order of the old area sheets. */
export function areaColumns(
  lookups: GridLookups,
  commit: Commit,
  remove: (line: CalcLine) => void,
  canEdit: boolean,
): Columns {
  const columns = editableColumns(lookups, commit, remove);
  return canEdit ? columns : readOnly(columns);
}

function editableColumns(lookups: GridLookups, commit: Commit, remove: (line: CalcLine) => void): Columns {
  return [
    {
      colId: "status",
      headerName: "",
      width: 64,
      pinned: "left",
      sortable: false,
      cellRenderer: (p: ICellRendererParams<Row>) => {
        const row = p.data;
        if (!isLine(row)) return null;
        const incomplete = (["estimate", "actual"] as const).some(
          (phase) => row[phase].figures !== null && !row[phase].amounts.complete,
        );
        const { status } = row.arrival;
        return (
          <span style={{ display: "inline-flex", gap: "var(--space-xs)", alignItems: "center" }}>
            {incomplete && (
              <span title="Sponsor type or VAT rate is missing: the VAT is not counted yet" style={{ color: "var(--warning-default)" }}>
                <FontAwesomeIcon icon={faTriangleExclamation} />
              </span>
            )}
            {(status === "ordered" || status === "partial") && (
              <span title={arrivalTitle[status]} style={{ color: "var(--warning-default)" }}>
                <FontAwesomeIcon icon={faHourglassHalf} />
              </span>
            )}
            {status === "received" && (
              <span title={arrivalTitle.received} style={{ color: "var(--success-default)" }}>
                <FontAwesomeIcon icon={faCheck} />
              </span>
            )}
            {status === "over" && (
              <span title={arrivalTitle.over} style={{ color: "var(--error-default)" }}>
                <FontAwesomeIcon icon={faTriangleExclamation} />
              </span>
            )}
          </span>
        );
      },
    },
    {
      colId: "item",
      headerName: "ITEM",
      width: 240,
      pinned: "left",
      valueGetter: (p) => p.data?.item ?? "",
      cellStyle: (p) => (p.node.rowPinned ? { fontWeight: 700 } : undefined),
      ...editableCell(commit, (v) => ({ item: String(v ?? "").trim() })),
      valueSetter: (p) => {
        const text = String(p.newValue ?? "").trim();
        if (isLine(p.data) && text !== "") commit(p.data, { item: text });
        return false;
      },
    },
    {
      colId: "category",
      headerName: "CATEGORY",
      width: 140,
      valueGetter: (p) => (isLine(p.data) ? (p.data.category ?? "") : ""),
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: ["", ...lookups.categories] },
      ...editableCell(commit, (v) => ({ category: blank(v) ? null : String(v) })),
    },
    {
      colId: "priority",
      headerName: "PRIORITY",
      width: 110,
      valueGetter: (p) => (isLine(p.data) ? (p.data.priority ?? "") : ""),
      cellRenderer: (p: ICellRendererParams<Row>) =>
        p.value ? <span className={`pill ${p.value}`}>{p.value}</span> : null,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: ["", ...lookups.priorities] },
      ...editableCell(commit, (v) => ({ priority: blank(v) ? null : String(v) })),
    },
    {
      headerName: "EXPECTED",
      headerClass: "phase-estimate",
      children: phaseColumns("estimate", lookups, commit),
    },
    {
      headerName: "ACTUAL",
      headerClass: "phase-actual",
      children: phaseColumns("actual", lookups, commit),
    },
    {
      colId: "note",
      headerName: "NOTE",
      width: 220,
      valueGetter: (p) => (isLine(p.data) ? (p.data.note ?? "") : ""),
      ...editableCell(commit, (v) => ({ note: blank(v) ? null : String(v) })),
    },
    {
      colId: "remove",
      headerName: "",
      width: 48,
      pinned: "right",
      sortable: false,
      cellRenderer: (p: ICellRendererParams<Row>) =>
        isLine(p.data) ? (
          <button className="icon-btn danger" title="Delete line" aria-label="Delete line" onClick={() => remove(p.data as CalcLine)}>
            <FontAwesomeIcon icon={faTrash} />
          </button>
        ) : null,
    },
  ];
}
