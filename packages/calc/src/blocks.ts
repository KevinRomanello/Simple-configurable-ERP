import type { CalcLine } from "./lines";
import type { Snapshot } from "./snapshot";

/** The ALL block plus one block per category, as in the old TOTAL, GANTT and ANALYSES sheets. */
export const ALL_BLOCK = "ALL";

export function blocksOf(snapshot: Snapshot): string[] {
  return [ALL_BLOCK, ...snapshot.lookups.categories];
}

/** Whether a line belongs to a block. ALL takes everything, even lines without a category. */
export function inBlock(line: CalcLine, block: string): boolean {
  return block === ALL_BLOCK || line.category === block;
}
