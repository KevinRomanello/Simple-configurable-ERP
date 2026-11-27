import { eq, sql } from "drizzle-orm";
import { contracts } from "../../core/contracts";
import { countRows, rowsOf } from "../../core/usage";
import { inventoryItem, itemType } from "../../db/schema/inventory";
import { auditLabels, auditText, lookupRenamed, usedBy } from "../../platform/platform.public";

// What the inventory answers to the core and hears from it (docs/moduli-architettura.md, §5): who uses a category, a unit or a place,
// a renamed category or unit, and the names the History gives its rows. It is read when the server starts (app.ts).

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
  if (kind === "unit") return rowsOf(await countRows(db, inventoryItem, inventoryItem.unit, names), subjects, "items");
  if (kind === "location") {
    // a movement counts once for a place, whether it is where it happened or where it went
    if (names.length === 0) return [];
    const codes = sql.join(names.map((name) => sql`(${name})`), sql`, `);
    const { rows } = await db.execute<{ code: string; n: number }>(
      sql`select c.code, count(*)::int as n from (values ${codes}) as c(code) join stock_movement m on m.location = c.code or m.to_location = c.code group by c.code`,
    );
    return rowsOf(new Map(rows.map((r) => [r.code, r.n])), subjects, "movements of the inventory");
  }
  return [];
});

contracts.on(lookupRenamed, "inventory", async (tx, { kind, from, to }) => {
  if (kind === "category") await tx.update(inventoryItem).set({ category: to }).where(eq(inventoryItem.category, from));
  if (kind === "unit") await tx.update(inventoryItem).set({ unit: to }).where(eq(inventoryItem.unit, from));
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
