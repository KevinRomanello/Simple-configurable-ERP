import { faCheck, faCoins, faHourglassHalf, faTrash, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { ColDef, ColGroupDef, ICellRendererParams, ValueSetterParams } from "ag-grid-community";
import type { FiguresPatch, LinePatch } from "../api/client";
import type { CalcLine, Fund, Phase, PhaseCalc } from "../api/types";
import { ArrivalPill, arrivalTitle } from "../components/ArrivalPill";
import { SearchSelectEditor } from "../components/SearchSelect";
import { date, money, quantity } from "../lib/format";
import { gridCompare } from "../lib/sort";

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
  /** The funds a line can be paid from in each phase (see GET /api/funds?phase=), and every fund by id and by name. */
  funds: Record<Phase, Fund[]>;
  fundById: Map<number, Fund>;
  fundByName: Map<string, Fund>;
  supplierNames: string[];
  supplierIdByName: Map<string, number>;
}

/** Sends a change of one line to the server (the grid never edits its own data). */
export type Commit = (line: CalcLine, patch: Omit<LinePatch, "version">) => void;

const isLine = (row: Row | undefined): row is CalcLine => row !== undefined && !("isSubtotal" in row);

/** While a search box is open, Enter and the arrows belong to its list, not to the grid. */
const keysForSearch = (p: { editing: boolean; event: KeyboardEvent | null }) =>
  p.editing && ["Enter", "ArrowUp", "ArrowDown"].includes(p.event?.key ?? "");

const INCOMPLETE_TIP = "CASH FROM or VAT % is missing: the VAT is not counted yet";
const PHASE_LABEL: Record<Phase, string> = { estimate: "EXPECTED", actual: "ACTUAL" };

/** A line is incomplete while a phase with data has no fund (or no VAT rate for the team fund). */
const isIncomplete = (line: CalcLine) =>
  (["estimate", "actual"] as const).some((phase) => line[phase].figures !== null && !line[phase].amounts.complete);

/** The phases in which the funds of a line cannot cover it. */
const shortPhases = (line: CalcLine) => (["estimate", "actual"] as const).filter((phase) => line[phase].shortCents > 0);

const SHORT_HINT = "Add another fund of the same group in ALSO FROM.";

/** What the icons of the status column mean: shown at once when the pointer is over the cell. */
function statusTip(row: Row | undefined): string | undefined {
  if (!isLine(row)) return undefined;
  const tips: string[] = [];
  if (isIncomplete(row)) tips.push(INCOMPLETE_TIP);
  for (const phase of shortPhases(row)) {
    tips.push(`${PHASE_LABEL[phase]}: the funds are ${money(row[phase].shortCents)} short. ${SHORT_HINT}`);
  }
  if (row.arrival.status !== "planned") tips.push(arrivalTitle[row.arrival.status]);
  return tips.length > 0 ? tips.join("\n") : undefined;
}

/** The funds that can pay the rest of a line after its first fund: only others of the same group (never the team's own money). */
function companionNames(lookups: GridLookups, phase: Phase, line: CalcLine): string[] {
  const chosen = line[phase].figures?.fundIds ?? [];
  const first = lookups.fundById.get(chosen[0] ?? -1);
  if (!first || first.kind === "team" || first.type !== "fund") return [];
  return lookups.funds[phase]
    .filter((f) => !chosen.includes(f.id))
    .filter((f) => f.kind === "external" && f.type === "fund" && f.group !== null && f.group.toLowerCase() === first.group?.toLowerCase())
    .map((f) => f.name);
}
const blank = (value: unknown) => value === "" || value === null || value === undefined;

/** A cell the person can change: calls `commit` instead of writing into the grid. */
function editableCell(
  commit: Commit,
  toPatch: (value: any) => Omit<LinePatch, "version">,
): Pick<ColDef<Row>, "editable" | "valueSetter"> {
  return {
    editable: (p) => isLine(p.data) && !p.node.rowPinned,
    valueSetter: (p: ValueSetterParams<Row>) => {
      // an editor closed without a choice hands back what the cell showed: that is no change
      if (isLine(p.data) && p.newValue !== p.oldValue) commit(p.data, toPatch(p.newValue));
      return false; // the screen reloads the real value from the server
    },
  };
}

/** The VAT rate a fund puts on a line: its own for a sponsor, the one typed on the line for the team fund. */
function ratesOf(lookups: GridLookups, fundId: number, lineRate: number | null): number | null {
  const fund = lookups.fundById.get(fundId);
  return !fund || fund.kind === "team" ? lineRate : fund.vatRate;
}

/** Whether the person types the VAT rate on this line: only when the team fund pays (or nobody does yet). */
const choosesOwnRate = (lookups: GridLookups, fundIds: number[]) =>
  fundIds.length === 0 || fundIds.some((id) => lookups.fundById.get(id)?.kind === "team");

/** What each fund of a line pays, and what is missing. */
function fundTip(row: Row | undefined, phase: Phase): string | undefined {
  if (!isLine(row)) return undefined;
  const { shares, shortCents } = row[phase];
  if (shares.length === 0) return undefined;
  const lines = shares.map((s) => `${s.fundName}: ${money(s.drawnCents)}`);
  if (shortCents > 0) lines.push(`${money(shortCents)} missing: not enough in the fund`);
  return lines.join("\n");
}

function phaseColumns(phase: Phase, lookups: GridLookups, commit: Commit, moreFunds: MoreFunds): ColDef<Row>[] {
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
    // sorted by the amount, not by the text it is shown as; a blank cell is an empty value
    comparator: (_a, _b, nodeA, nodeB, isDescending) => {
      const amountOf = (row: Row | undefined) => {
        const amounts = amountsOf(row);
        const cents = amounts ? pick(amounts) : 0;
        return cents === 0 && id !== "vat" ? null : cents;
      };
      return gridCompare(amountOf(nodeA.data), amountOf(nodeB.data), isDescending);
    },
    ...(bold ? { cellStyle: { fontWeight: 700 } } : {}),
  });

  return [
    {
      colId: `${phase}.quantity`,
      headerName: "QTY",
      width: 80,
      headerClass: "phase-start", // the bar that divides expected from actual
      cellClass: ["num", "phase-start"],
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
      width: 200,
      cellClass: (p) => (isLine(p.data) && p.data[phase].shortCents > 0 ? "cell-negative" : undefined),
      tooltipValueGetter: (p) => fundTip(p.data, phase),
      valueGetter: (p) => {
        const shares = p.data?.[phase].shares ?? [];
        // with several funds each one shows what it pays
        return shares.length > 1 ? `${shares[0]!.fundName} (${money(shares[0]!.drawnCents)})` : (p.data?.[phase].fundName ?? "");
      },
      cellEditor: SearchSelectEditor,
      cellEditorPopup: true,
      suppressKeyboardEvent: keysForSearch,
      cellEditorParams: { values: ["", ...lookups.funds[phase].map((f) => f.name)] },
      // choosing the first fund starts the list again: the other funds are chosen afterwards
      ...editableCell(commit, (v) =>
        patchFigures({ fundIds: blank(v) ? [] : [lookups.fundByName.get(String(v).toLowerCase())?.id].flatMap((id) => (id === undefined ? [] : [id])) }),
      ),
    },
    {
      colId: `${phase}.moreFunds`,
      headerName: "ALSO FROM",
      hide: !moreFunds[phase], // not there unless a fund of this project runs short
      width: 200,
      cellClass: (p) => (isLine(p.data) && p.data[phase].shortCents > 0 ? "cell-warning" : undefined),
      tooltipValueGetter: (p) => (isLine(p.data) && p.data[phase].shortCents > 0 ? SHORT_HINT : undefined),
      valueGetter: (p) =>
        (p.data?.[phase].shares ?? [])
          .slice(1)
          .map((share) => `${share.fundName} (${money(share.drawnCents)})`)
          .join(" + "),
      cellEditor: SearchSelectEditor,
      cellEditorPopup: true,
      suppressKeyboardEvent: keysForSearch,
      cellEditorParams: (p: { data?: Row }) => ({
        values: ["", ...(isLine(p.data) ? companionNames(lookups, phase, p.data) : [])],
      }),
      // the box is there only while it is needed: the funds run short and another one fits, or the line
      // already has more than one (a blank choice takes the extra ones away)
      editable: (p) =>
        isLine(p.data) &&
        !p.node.rowPinned &&
        (p.data[phase].shares.length > 1 || (p.data[phase].shortCents > 0 && companionNames(lookups, phase, p.data).length > 0)),
      valueSetter: (p: ValueSetterParams<Row>) => {
        if (!isLine(p.data) || p.newValue === p.oldValue) return false; // closed without a choice
        const current = p.data[phase].figures?.fundIds ?? [];
        const wanted = String(p.newValue ?? "");
        const picked = lookups.fundByName.get(wanted.toLowerCase());
        // a blank choice takes the extra funds away, leaving the first; a fund is added after the others
        if (wanted === "") commit(p.data, patchFigures({ fundIds: current.slice(0, 1) }));
        else if (picked) commit(p.data, patchFigures({ fundIds: [...current, picked.id] }));
        return false;
      },
    },
    {
      colId: `${phase}.supplier`,
      headerName: "BOUGHT FROM",
      width: 150,
      valueGetter: (p) => p.data?.[phase].supplierName ?? "",
      cellEditor: SearchSelectEditor,
      cellEditorPopup: true,
      suppressKeyboardEvent: keysForSearch,
      cellEditorParams: { values: ["", ...lookups.supplierNames] },
      ...editableCell(commit, (v) =>
        patchFigures({ supplierId: blank(v) ? null : (lookups.supplierIdByName.get(String(v).toLowerCase()) ?? null) }),
      ),
    },
    {
      colId: `${phase}.vatRate`,
      headerName: "VAT %",
      width: 90,
      // a sponsor brings its own rate; the rate is chosen on the line only for the team fund (or without a fund)
      valueGetter: (p) => {
        const f = fig(p.data);
        if (!f) return "";
        const rates = f.fundIds.length === 0 ? [f.vatRate] : f.fundIds.map((id) => ratesOf(lookups, id, f.vatRate));
        const shown = [...new Set(rates.filter((r) => r !== null))];
        return shown.map((r) => `${r}%`).join(" / ");
      },
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: ["", ...lookups.vatRates.map((r) => `${r}%`)] },
      ...editableCell(commit, (v) => patchFigures({ vatRate: blank(v) ? null : Number(String(v).replace("%", "")) })),
      editable: (p) => isLine(p.data) && !p.node.rowPinned && choosesOwnRate(lookups, fig(p.data)?.fundIds ?? []),
    },
    { ...amountColumn("gross", "GRAND TOTAL", (a) => a.grossCents), headerClass: "sum", cellClass: ["calc", "sum"] },
    {
      ...amountColumn("outflow", "OUTFLOW", (a) => a.outflowCents, 118, true),
      cellClass: ["calc", "sum-next"],
      // what the sponsor gives for free (a gift, or an old partial sponsor of the sheet) is not a column: it is explained here
      tooltipValueGetter: (p) => {
        const a = amountsOf(p.data);
        return a && a.sponsorCents > 0 ? `${money(a.grossCents)} grand total - ${money(a.sponsorCents)} given for free by the sponsor` : undefined;
      },
    },
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
    // Only what was bought can arrive: the inventory (PENDING) tells how much of it has.
    ...(phase === "actual" ? [arrivalColumn] : []),
  ];
}

const arrivalColumn: ColDef<Row> = {
  colId: "actual.arrival",
  headerName: "ARRIVED",
  width: 150,
  cellClass: "calc",
  tooltipValueGetter: (p) => (isLine(p.data) && p.data.arrival.status !== "planned" ? arrivalTitle[p.data.arrival.status] : undefined),
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
/** The narrowest a column may get: the longest word of its header (headers wrap at spaces) plus room for the padding and the sort arrow. */
const headerMinWidth = (name: string) => Math.ceil(Math.max(...name.split(" ").map((word) => word.length)) * 8.2) + 46;

/** Columns are as wide as their content (the grid fits them); this keeps each from getting narrower than its header word. */
function withMinWidths(columns: Columns): Columns {
  return columns.map((c) =>
    "children" in c
      ? { ...c, children: withMinWidths(c.children as Columns) as ColDef<Row>[] }
      : c.headerName
        ? { minWidth: headerMinWidth(c.headerName), ...c }
        : c,
  );
}

/** Per phase: whether the ALSO FROM column is shown, because some line of the project needs another fund (or already has one). */
export type MoreFunds = Record<Phase, boolean>;

export function needsMoreFunds(lines: CalcLine[]): MoreFunds {
  const needs = (phase: Phase) => lines.some((l) => l[phase].shortCents > 0 || l[phase].shares.length > 1);
  return { estimate: needs("estimate"), actual: needs("actual") };
}

export function areaColumns(
  lookups: GridLookups,
  commit: Commit,
  remove: (line: CalcLine) => void,
  canEdit: boolean,
  moreFunds: MoreFunds,
): Columns {
  const columns = withMinWidths(editableColumns(lookups, commit, remove, moreFunds));
  return canEdit ? columns : readOnly(columns);
}

function editableColumns(lookups: GridLookups, commit: Commit, remove: (line: CalcLine) => void, moreFunds: MoreFunds): Columns {
  return [
    {
      colId: "status",
      headerName: "",
      width: 84,
      pinned: "left",
      sortable: false,
      tooltipValueGetter: (p) => statusTip(p.data),
      cellRenderer: (p: ICellRendererParams<Row>) => {
        const row = p.data;
        if (!isLine(row)) return null;
        const { status } = row.arrival;
        return (
          <span style={{ display: "inline-flex", gap: "var(--space-xs)", alignItems: "center" }} aria-label={statusTip(row)}>
            {isIncomplete(row) && (
              <span style={{ color: "var(--warning-default)" }}>
                <FontAwesomeIcon icon={faTriangleExclamation} />
              </span>
            )}
            {shortPhases(row).length > 0 && (
              <span style={{ color: "var(--error-default)" }}>
                <FontAwesomeIcon icon={faCoins} />
              </span>
            )}
            {(status === "ordered" || status === "partial") && (
              <span style={{ color: "var(--warning-default)" }}>
                <FontAwesomeIcon icon={faHourglassHalf} />
              </span>
            )}
            {status === "received" && (
              <span style={{ color: "var(--success-default)" }}>
                <FontAwesomeIcon icon={faCheck} />
              </span>
            )}
            {status === "over" && (
              <span style={{ color: "var(--error-default)" }}>
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
      maxWidth: 320,
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
      cellEditor: SearchSelectEditor,
      cellEditorPopup: true,
      suppressKeyboardEvent: keysForSearch,
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
      headerClass: ["phase-estimate", "phase-start"],
      children: phaseColumns("estimate", lookups, commit, moreFunds),
    },
    {
      headerName: "ACTUAL",
      headerClass: ["phase-actual", "phase-start"],
      children: phaseColumns("actual", lookups, commit, moreFunds),
    },
    {
      colId: "note",
      headerName: "NOTE",
      width: 220,
      maxWidth: 260,
      valueGetter: (p) => (isLine(p.data) ? (p.data.note ?? "") : ""),
      ...editableCell(commit, (v) => ({ note: blank(v) ? null : String(v) })),
    },
    {
      colId: "remove",
      headerName: "",
      width: 48,
      pinned: "right",
      sortable: false,
      tooltipValueGetter: (p) => (isLine(p.data) ? "Delete this line" : undefined),
      cellRenderer: (p: ICellRendererParams<Row>) =>
        isLine(p.data) ? (
          <button className="icon-btn danger" aria-label="Delete line" onClick={() => remove(p.data as CalcLine)}>
            <FontAwesomeIcon icon={faTrash} />
          </button>
        ) : null,
    },
  ];
}
