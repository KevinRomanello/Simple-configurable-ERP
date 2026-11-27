import type { CalcLine } from "@erp/calc";
import { definePort } from "../../core/contracts";

// What the inventory asks of the others (docs/moduli-architettura.md, §5), defined here and not in `inventory.public.ts` so that the inventory's own
// services can use them without a cycle. The inventory works alone: every port has a plain answer for when nobody fills it (no budget: no
// project to choose, nothing tied to a purchase, nothing bought or on its way in the statistics). The bridge to the budget fills them.

/** What a movement is tied to on the budget's side: the project it was for and the purchase of the budget it completes. */
export interface MovementTie {
  movementId: number;
  projectId: number | null;
  lineId: number | null;
}

/** The ties of these movements (or of every movement); a movement tied to nothing is not there. None when there is no budget. */
export const movementTies = definePort<{ movementIds?: number[] }, MovementTie[]>("movementTies", "inventory", () => []);

/** The projects with these ids, with their names: a project the inventory is given must be one of them. None when there is no budget. */
export const knownProjects = definePort<{ ids: number[] }, { id: number; name: string }[]>("knownProjects", "inventory", () => []);

/** Keeps the project these movements were for (one already checked with `knownProjects`); nobody keeps it when there is no budget. */
export const keepMovementProject = definePort<{ movementIds: number[]; projectId: number }, void>("keepMovementProject", "inventory", () => undefined);

/** The project «Make new» starts from, for these made items (or every item); an item without one is not there. None when there is no budget. */
export const makeProjects = definePort<{ itemIds?: number[] }, { itemId: number; projectId: number }[]>("makeProjects", "inventory", () => []);

/** Sets, or with null takes away, the project «Make new» starts from (one already checked with `knownProjects`). */
export const keepMakeProject = definePort<{ itemId: number; projectId: number | null }, void>("keepMakeProject", "inventory", () => undefined);

/** What the statistics need of the budget for a season: its lines (bought, on its way) and its projects and areas (the cuts by project and area). */
export interface StatsBudget {
  lines: CalcLine[];
  projects: { id: number; name: string; areaId: number }[];
  areas: { id: number; name: string }[];
}

export const statsBudget = definePort<{ season: { id: number; startsOn: string; endsOn: string } }, StatsBudget>("statsBudget", "inventory", () => ({
  lines: [],
  projects: [],
  areas: [],
}));

/** The car each of these receipts is for when it completes a purchase of the budget: the car of its line. None when there is no budget. */
export const lineCarsOfReceipts = definePort<{ movementIds: number[] }, { movementId: number; seasonId: number }[]>("lineCarsOfReceipts", "inventory", () => []);
