import type { Legend } from "./chart";
import type { Table } from "./table";

/** What a block of a page gives when it is exported. */
export type Collected =
  | { kind: "table"; table: Table }
  | { kind: "chart"; svg: SVGSVGElement; legend: Legend[]; table: Table };

/** A block that was chosen, with what it holds right now. */
export interface Resolved {
  title: string;
  collected: Collected;
}
