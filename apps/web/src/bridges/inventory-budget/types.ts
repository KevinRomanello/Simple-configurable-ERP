// The shapes of the answers of inventory-budget (split from api/types.ts in G7: docs/moduli-architettura.md, §7.1).
import type { PendingLine } from "@erp/calc";

export interface PendingRow extends PendingLine {
  receivedItemId: number | null;
  suggestedItemId: number | null;
}
