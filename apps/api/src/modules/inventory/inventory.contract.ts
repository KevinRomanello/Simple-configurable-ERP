import { eq } from "drizzle-orm";
import { contracts } from "../../core/contracts";
import { countRows, rowsOf } from "../../core/usage";
import { inventoryItem, itemType } from "../../db/schema/inventory";
import { auditLabels, auditText, categoryCreated, lookupRenamed, permissionRules, usedBy } from "../../platform/platform.public";
import { startCategoryFields } from "./lists.service";

// What the inventory answers to the core and hears from it (docs/moduli-architettura.md, §5): who uses a category, a renamed or a new
// category, who keeps the inventory, and the names the History gives its rows. Its own lists (units, places, the fields of a category)
// it counts and renames itself (lists.service.ts). It is read when the server starts (app.ts).

contracts.answer(usedBy, "inventory", async (db, { kind, subjects }) => {
  const names = subjects.map((s) => s.name);
  if (kind === "category") {
    // the types of items point at a category by its id, the items by its name
    const types = await countRows(db, itemType, itemType.categoryId, subjects.map((s) => s.id!));
    return [
      ...rowsOf(await countRows(db, inventoryItem, inventoryItem.category, names), subjects, "items"),
      ...rowsOf(types, subjects.map((s) => ({ key: s.key, name: String(s.id) })), "item types"),
    ];
  }
  return [];
});

contracts.on(lookupRenamed, "inventory", async (tx, { kind, from, to }) => {
  if (kind === "category") await tx.update(inventoryItem).set({ category: to }).where(eq(inventoryItem.category, from));
});

// a new category shows, on an item, the fields of an item without a category
contracts.on(categoryCreated, "inventory", (tx, { categoryId }) => startCategoryFields(tx, categoryId));

contracts.declare(permissionRules, "inventory", {
  key: "canManageInventory",
  // the inventory is kept by the people who run the projects: the admins and the project managers
  rule: (user) => user.role === "admin" || user.role === "pm",
});

contracts.declare(auditLabels, "inventory", {
  inventory_item: (row) => auditText(row, "name"),
  stock_movement: (row) => `${auditText(row, "kind")} of item ${String(row.item_id ?? "")}`,
  category_field: (row) => `${auditText(row, "field")} of ${row.category_id == null ? "items without a category" : `category ${String(row.category_id)}`}`,
  // a place was a site and a room before it was a room, a shelf and a level: the older rows have the site
  location: (row) => ["site", "room", "shelf", "level"].map((key) => auditText(row, key)).filter((part) => part !== "").join(" / "),
  component_part: (row) => `part ${String(row.part_id ?? "")} of item ${String(row.component_id ?? "")}`,
  item_param_value: (row) => `parameter ${String(row.param_id ?? "")} of item ${String(row.item_id ?? "")}`,
});
