import { asc } from "drizzle-orm";
import { db } from "../../db/client";
import { category, setting, vatRate } from "../../db/schema/platform";

// The lists of the core that every module writes with (docs/impostazioni.md): the categories and the VAT rates, and the switch of the
// site that everybody is told about. The budget's lists and switches are in modules/budget/lookups.service.ts, the inventory's in
// modules/inventory/lists.service.ts, the layout of the financial statement in the treasury (statement.service.ts).

/** The categories, in their order (the blocks of TOTAL and of the Gantt follow it). */
export async function listCategories(): Promise<string[]> {
  const rows = await db.select({ name: category.name }).from(category).orderBy(asc(category.position), asc(category.id));
  return rows.map((r) => r.name);
}

/** VAT rates a line can use, in percent. */
export async function listVatRates(): Promise<number[]> {
  const rows = await db.select({ rate: vatRate.rate }).from(vatRate).orderBy(asc(vatRate.rate));
  return rows.map((r) => Number(r.rate));
}

/** Whether the site can be changed from a phone: an admin switch of the Settings page (everybody reads it, with who they are). */
export async function getEditOnPhone(): Promise<boolean> {
  const [row] = await db.select({ editOnPhone: setting.editOnPhone }).from(setting);
  if (!row) throw new Error("The settings are missing: run the migrations (pnpm db:migrate)");
  return row.editOnPhone;
}
