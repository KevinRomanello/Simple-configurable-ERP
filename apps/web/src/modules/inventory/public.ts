// What the other parts of the site may use of the inventory (docs/moduli-architettura.md, §7.3): the slots of its pages and what they take.
import { defineSlot } from "../../core/slots";
import type { ProjectRef } from "./types";

export type { ProjectRef, PurchaseToReceive } from "./types";

/**
 * The projects a movement, an arrival or a build can be for, and how to ask for them: the bridge to the budget gives them
 * (`GET /api/inventory-budget/projects`). Without it there are none to choose.
 */
export const purposeProjects = defineSlot<() => Promise<ProjectRef[]>>("inventory.purpose.projects");
