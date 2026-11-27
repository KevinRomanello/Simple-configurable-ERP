// The slots of the pages of the inventory (docs/moduli-architettura.md, §7.4): the others fill them through public.ts.
import { defineSlot } from "../../core/slots";
import type { ProjectRef } from "./types";

/**
 * The projects a movement, an arrival or a build can be for, and how to ask for them: the bridge to the budget gives them
 * (`GET /api/inventory-budget/projects`). Without it there are none to choose.
 */
export const purposeProjects = defineSlot<() => Promise<ProjectRef[]>>("inventory.purpose.projects");
