// The calls of inventory-budget to the API (split from api/client.ts in G7: docs/moduli-architettura.md, §7.1).
import { get } from "../../core/api";
import type { PendingRow, ProjectRef } from "./types";

export const inventoryBudgetApi = {
  inventoryProjects: () => get<ProjectRef[]>("/inventory-budget/projects"),
  pending: () => get<PendingRow[]>("/inventory-budget/pending"),
};
