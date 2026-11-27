// What needs both the inventory and the budget: the purchase of the budget a receipt completes, the project a movement of the shelf
// was for, and the project «Make new» starts from for a made item. They were columns of the inventory's tables (until G5).

import {
  index,
  integer,
  pgTable,
} from "drizzle-orm/pg-core";
import { id } from "./columns";
import { budgetLine, project } from "./budget";
import { inventoryItem, stockMovement } from "./inventory";

/** The purchase of the budget (a line) a receipt completes: a receipt completes at most one, a line can arrive in several receipts. */
export const receiptLine = pgTable(
  "receipt_line",
  {
    id: id(),
    movementId: integer()
      .notNull()
      .unique()
      .references(() => stockMovement.id, { onDelete: "cascade" }),
    lineId: integer()
      .notNull()
      .references(() => budgetLine.id, { onDelete: "cascade" }),
  },
  (t) => [index("receipt_line_line").on(t.lineId)],
);

/** The project a movement of the shelf was for (a receipt, a use, a build and the parts it took). */
export const movementProject = pgTable(
  "movement_project",
  {
    id: id(),
    movementId: integer()
      .notNull()
      .unique()
      .references(() => stockMovement.id, { onDelete: "cascade" }),
    projectId: integer()
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
  },
  (t) => [index("movement_project_project").on(t.projectId)],
);

/**
 * Only a made item: the project «Make new» starts from, set when the item is made or later, so that making some asks for the
 * quantity and little else. The project is one of a season (it is not offered when it is of another).
 */
export const itemMakeProject = pgTable(
  "item_make_project",
  {
    id: id(),
    itemId: integer()
      .notNull()
      .unique()
      .references(() => inventoryItem.id, { onDelete: "cascade" }),
    projectId: integer()
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
  },
  (t) => [index("item_make_project_project").on(t.projectId)],
);
