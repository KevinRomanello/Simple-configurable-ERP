// The calls of inventory-budget to the API (split from api/client.ts in G7: docs/moduli-architettura.md, §7.1).
import { get, post } from "../../core/api";
import type { ProjectRef } from "../../modules/inventory/public";
import type { PendingRow } from "./types";

export const inventoryBudgetApi = {
  inventoryProjects: () => get<ProjectRef[]>("/inventory-budget/projects"),
  pending: () => get<PendingRow[]>("/inventory-budget/pending"),
  /** The goods of a purchase of the budget arrived: the body is the one of an arrival of the inventory (`ReceiveBody`). */
  receiveLine: (lineId: number, body: object) => post<unknown>(`/inventory-budget/pending/${lineId}/receive`, body),
};
