import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Legend } from "./export/chart";
import { tableFromDom, type Table } from "./export/table";
import { SCREEN, useMaxWidth } from "./screen";
import type { Collected } from "./export/types";

// A page says which of its tables and charts can go into a downloaded file by wrapping them in a
// block (`TableBox`, the charts, the grids). The Download button of the page header lists what
// is on the page at that moment and lets the person choose.

export interface ExportBlock {
  id: string;
  title: string;
  kind: "table" | "chart";
  /** Where the block is on the page: the list follows the page from top to bottom. */
  element: () => Element | null;
  collect: () => Collected | null;
}

/**
 * A file the page can give besides the PDF and the Excel file of what is on the screen: made by the page itself (the CSV of all the
 * records of a view, a calendar). It is a format of the same Download button, not a button of its own.
 */
export interface ExportFormat {
  id: string;
  label: string;
  /** Makes the file and hands it to the browser. */
  run: () => Promise<void> | void;
}

interface Registry {
  register: (block: ExportBlock) => () => void;
  registerFormats: (owner: string, formats: ExportFormat[]) => () => void;
}

const BlocksContext = createContext<ExportBlock[]>([]);
const FormatsContext = createContext<ExportFormat[]>([]);
const RegisterContext = createContext<Registry["register"]>(() => () => {});
const RegisterFormatsContext = createContext<Registry["registerFormats"]>(() => () => {});

/** Collects the blocks and the extra formats of the page that is open. */
export function ExportProvider({ children }: { children: ReactNode }) {
  const [blocks, setBlocks] = useState<ExportBlock[]>([]);
  const [owned, setOwned] = useState<{ owner: string; formats: ExportFormat[] }[]>([]);
  const [register] = useState<Registry["register"]>(() => (block: ExportBlock) => {
    setBlocks((current) => [...current.filter((b) => b.id !== block.id), block]);
    return () => setBlocks((current) => current.filter((b) => b.id !== block.id));
  });
  const [registerFormats] = useState<Registry["registerFormats"]>(() => (owner: string, formats: ExportFormat[]) => {
    setOwned((current) => [...current.filter((o) => o.owner !== owner), { owner, formats }]);
    return () => setOwned((current) => current.filter((o) => o.owner !== owner));
  });
  const formats = owned.flatMap((o) => o.formats);
  return (
    <RegisterContext.Provider value={register}>
      <RegisterFormatsContext.Provider value={registerFormats}>
        <BlocksContext.Provider value={blocks}>
          <FormatsContext.Provider value={formats}>{children}</FormatsContext.Provider>
        </BlocksContext.Provider>
      </RegisterFormatsContext.Provider>
    </RegisterContext.Provider>
  );
}

export const useExportBlocks = () => useContext(BlocksContext);
export const useExportFormats = () => useContext(FormatsContext);

/** Adds formats to the Download button of the page, for as long as the page that calls this is there. */
export function useProvideExportFormats(formats: ExportFormat[]) {
  const owner = useId();
  const register = useContext(RegisterFormatsContext);
  const latest = useRef(formats);
  latest.current = formats; // `run` is always the one of the last drawing
  const key = formats.map((f) => `${f.id}:${f.label}`).join("|");
  useEffect(
    () => register(owner, formats.map((f) => ({ id: f.id, label: f.label, run: () => latest.current.find((x) => x.id === f.id)?.run() }))),
    // only the ids and the labels decide what is registered: `run` is read from `latest` when it is used
    [owner, key, register],
  );
}

/**
 * Puts a part of the page on the list of what can be downloaded, for as long as it is on the page. `listed: false`: it is
 * not on the list (a table of work, such as the fields of a registry table, is not something to download).
 */
export function useExportBlock(block: Omit<ExportBlock, "id">, listed = true) {
  const id = useId();
  const latest = useRef(block);
  latest.current = block;
  const register = useContext(RegisterContext);
  useEffect(
    () =>
      listed
        ? register({
            id,
            title: block.title,
            kind: block.kind,
            element: () => latest.current.element(),
            collect: () => latest.current.collect(),
          })
        : undefined,
    [id, block.title, block.kind, register, listed],
  );
}

/**
 * On a phone a table marked `phone-cards` shows each row as a card, every value with the name of its column
 * in front (CSS, `data-label`): the names are written on the cells here, from the headers, so that the
 * tables made by hand get them too. A cell across several columns gets none.
 */
function labelCells(table: HTMLTableElement) {
  const headers = [...(table.tHead?.rows[0]?.cells ?? [])].map((th) => th.textContent?.trim() ?? "");
  for (const body of table.tBodies) {
    for (const row of body.rows) {
      let column = 0;
      for (const cell of row.cells) {
        cell.setAttribute("data-label", cell.colSpan > 1 ? "" : (headers[column] ?? ""));
        column += cell.colSpan;
      }
    }
  }
}

/** A table of the page (the box with the scroll bar around it), downloadable under `title` (`listed: false`: not on the Download list); `cards`: one card per row on a phone. */
export function TableBox({ title, children, className = "", cards = false, listed = true }: { title: string; children: ReactNode; className?: string; cards?: boolean; listed?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  // only where the cards are shown (a long list on a computer does not need it), after every drawing:
  // rows and columns may have changed
  const asCards = useMaxWidth(SCREEN.cards) && cards;
  useLayoutEffect(() => {
    const table = box.current?.querySelector("table");
    if (asCards && table) labelCells(table);
  });
  useExportBlock(
    {
      title,
      kind: "table",
      element: () => box.current,
      collect: () => {
        const table = box.current?.querySelector("table");
        return table ? { kind: "table", table: tableFromDom(table) } : null;
      },
    },
    listed,
  );
  return (
    <div ref={box} className={`table-wrap${cards ? " as-cards" : ""} ${className}`.trim()}>
      {children}
    </div>
  );
}

/** A chart of the page, downloadable under its title as a picture (legend included) with its numbers. */
export function ChartFigure({ title, legend, table, children }: { title: string; legend: Legend[]; table: Table; children: ReactNode }) {
  const figure = useRef<HTMLElement>(null);
  useExportBlock({
    title,
    kind: "chart",
    element: () => figure.current,
    collect: () => {
      const svg = figure.current?.querySelector<SVGSVGElement>(".recharts-wrapper > svg");
      return svg ? { kind: "chart", svg, legend, table } : null;
    },
  });
  return (
    <figure ref={figure} className="chart">
      <figcaption className="bold">{title}</figcaption>
      {children}
    </figure>
  );
}
