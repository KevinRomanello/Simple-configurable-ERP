import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { Legend } from "../lib/export/chart";
import { tableFromDom, type Table } from "../lib/export/table";
import type { Collected } from "../lib/export/types";

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

interface Registry {
  register: (block: ExportBlock) => () => void;
}

const BlocksContext = createContext<ExportBlock[]>([]);
const RegisterContext = createContext<Registry["register"]>(() => () => {});

/** Collects the blocks of the page that is open. */
export function ExportProvider({ children }: { children: ReactNode }) {
  const [blocks, setBlocks] = useState<ExportBlock[]>([]);
  const [register] = useState<Registry["register"]>(() => (block: ExportBlock) => {
    setBlocks((current) => [...current.filter((b) => b.id !== block.id), block]);
    return () => setBlocks((current) => current.filter((b) => b.id !== block.id));
  });
  return (
    <RegisterContext.Provider value={register}>
      <BlocksContext.Provider value={blocks}>{children}</BlocksContext.Provider>
    </RegisterContext.Provider>
  );
}

export const useExportBlocks = () => useContext(BlocksContext);

/** Puts a part of the page on the list of what can be downloaded, for as long as it is on the page. */
export function useExportBlock(block: Omit<ExportBlock, "id">) {
  const id = useId();
  const latest = useRef(block);
  latest.current = block;
  const register = useContext(RegisterContext);
  useEffect(
    () =>
      register({
        id,
        title: block.title,
        kind: block.kind,
        element: () => latest.current.element(),
        collect: () => latest.current.collect(),
      }),
    [id, block.title, block.kind, register],
  );
}

/** A table of the page (the box with the scroll bar around it), downloadable under `title`. */
export function TableBox({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  useExportBlock({
    title,
    kind: "table",
    element: () => box.current,
    collect: () => {
      const table = box.current?.querySelector("table");
      return table ? { kind: "table", table: tableFromDom(table) } : null;
    },
  });
  return (
    <div ref={box} className={`table-wrap ${className}`.trim()}>
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
