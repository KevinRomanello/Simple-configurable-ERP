import {
  bom, byItem, costContext, onHandMilli, priceHistory, receivedMilli, stockRows, unitCost,
  type Bom, type PricePoint, type StockRow,
} from "@erp/calc";
import { and, desc, eq, sql } from "drizzle-orm";
import { conflict, forbidden, invalid, notFound } from "../../core/errors";
import { runWrite, type Tx } from "../../core/tx";
import { today } from "../../core/today";
import { db } from "../../db/client";
import { componentPart, inventoryItem, itemImage, project, stockMovement } from "../../db/schema";
import { canManageInventory, getCurrentUser } from "../auth/auth.service";
import { listCategories, listLocations, listUnits } from "../lookups/lookups.service";
import { IMAGE_LIMITS, type CreateItemInput, type PriceQuery, type UpdateItemInput } from "./inventory.schema";
import { loadInventory } from "./inventory.data";

export async function assertCanManageInventory() {
  const actor = await getCurrentUser();
  if (!(await canManageInventory(actor))) throw forbidden("You cannot change the inventory");
  return actor;
}

async function checkItemFields(input: { category?: string | null; unit?: string }) {
  if (input.category != null && !(await listCategories()).includes(input.category)) {
    throw invalid(`Unknown category "${input.category}"`);
  }
  if (input.unit !== undefined && !(await listUnits()).includes(input.unit)) {
    throw invalid(`Unknown unit "${input.unit}"`);
  }
}

/** The name or code is taken: say by which item, so the person can use that one instead. */
export async function findDuplicate(tx: Pick<Tx, "select">, name: string | undefined, code: string | null | undefined, exceptId?: number) {
  const same = [
    name !== undefined ? sql`lower(${inventoryItem.name}) = lower(${name})` : undefined,
    code ? sql`lower(${inventoryItem.code}) = lower(${code})` : undefined,
  ].filter((c) => c !== undefined);
  if (same.length === 0) return;
  const [found] = await tx
    .select()
    .from(inventoryItem)
    .where(and(sql`(${sql.join(same, sql` or `)})`, exceptId === undefined ? undefined : sql`${inventoryItem.id} <> ${exceptId}`));
  if (found) throw conflict(`There is already an item "${found.name}" with this name or code`);
}

/** Creates an item (used by the receiving flow too, inside its own transaction). */
export async function insertItem(tx: Tx, input: CreateItemInput) {
  await checkItemFields(input);
  await findDuplicate(tx, input.name, input.code);
  const [created] = await tx.insert(inventoryItem).values(input).returning();
  return created!;
}

export async function createItem(input: CreateItemInput) {
  const actor = await assertCanManageInventory();
  return runWrite(actor, (tx) => insertItem(tx, input));
}

export async function updateItem(itemId: number, input: UpdateItemInput) {
  const actor = await assertCanManageInventory();
  await checkItemFields(input);
  return runWrite(actor, async (tx) => {
    const [target] = await tx.select().from(inventoryItem).where(eq(inventoryItem.id, itemId));
    if (!target) throw notFound("Item");
    if (Object.keys(input).length === 0) return target; // nothing to change (a field the API does not take is ignored)
    await findDuplicate(tx, input.name, input.code, itemId);
    const [updated] = await tx.update(inventoryItem).set(input).where(eq(inventoryItem.id, itemId)).returning();
    return updated!;
  });
}

/** Deletes an item nothing has ever happened to and no bill of materials uses. */
export async function deleteItem(itemId: number) {
  const actor = await assertCanManageInventory();
  await runWrite(actor, async (tx) => {
    const [target] = await tx.select().from(inventoryItem).where(eq(inventoryItem.id, itemId));
    if (!target) throw notFound("Item");
    const [moved] = await tx.select({ n: sql<number>`count(*)::int` }).from(stockMovement).where(eq(stockMovement.itemId, itemId));
    if ((moved?.n ?? 0) > 0) throw conflict(`"${target.name}" has ${moved?.n} movements: they stay in the history`);
    const [used] = await tx.select({ n: sql<number>`count(*)::int` }).from(componentPart).where(eq(componentPart.partId, itemId));
    if ((used?.n ?? 0) > 0) throw conflict(`"${target.name}" is a part of ${used?.n} other items: remove it from them first`);
    await tx.delete(inventoryItem).where(eq(inventoryItem.id, itemId));
  });
}

// --- reading --------------------------------------------------------------------------------------

export interface ItemRow {
  id: number;
  code: string | null;
  name: string;
  category: string | null;
  unit: string;
  origin: "bought" | "made";
  hasImage: boolean;
  onHandMilli: number;
  /** How much came in through receipts, whatever happened to it since. */
  boughtMilli: number;
  /** What one unit costs now (null: never bought, or a made item with nothing priced). */
  unitE4: number | null;
  /** False when something in the cost is missing: a material of a made item that was never bought. */
  complete: boolean;
  /** What is on the shelf, at that price. */
  valueCents: number | null;
  places: string[];
}

/** The items with their stock and price. Filters are applied here: there are few items. */
export async function listItems(query: PriceQuery & { search?: string; category?: string; origin?: string; location?: string }): Promise<ItemRow[]> {
  const data = await loadInventory();
  const on = query.on ?? today();
  const ctx = costContext(data, query.basis);
  const stock = byItem(stockRows(data.movements));
  const moved = byItem(data.movements);
  const withImage = new Set((await db.select({ id: itemImage.itemId }).from(itemImage)).map((r) => r.id));
  const [rows, labels] = [await db.select().from(inventoryItem), new Map((await listLocations()).map((l) => [l.code, l.label]))];
  const needle = query.search?.toLowerCase();

  return rows
    .filter((r) => (query.category ? r.category === query.category : true))
    .filter((r) => (query.origin ? r.origin === query.origin : true))
    .filter((r) => (needle ? [r.name, r.code, r.purpose, r.category].some((v) => v?.toLowerCase().includes(needle)) : true))
    .filter((r) => (query.location ? (stock.get(r.id) ?? []).some((s) => s.location === query.location) : true))
    .map((r): ItemRow => {
      const cost = unitCost(r.id, ctx, query.method, on);
      const shelf = stock.get(r.id) ?? [];
      const onHand = onHandMilli(shelf, r.id);
      return {
        id: r.id,
        code: r.code,
        name: r.name,
        category: r.category,
        unit: r.unit,
        origin: r.origin,
        hasImage: withImage.has(r.id),
        onHandMilli: onHand,
        boughtMilli: receivedMilli(moved.get(r.id) ?? [], r.id),
        unitE4: cost.unitE4,
        complete: cost.complete,
        valueCents: cost.unitE4 === null ? null : Math.round((onHand * cost.unitE4) / 100_000),
        places: [...new Set(shelf.map((s) => labels.get(s.location) ?? s.location))],
      };
    })
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

export interface MovementRow {
  id: number;
  kind: string;
  on: string;
  quantity: string;
  location: string;
  spot: string;
  toLocation: string | null;
  toSpot: string | null;
  unitNet: string | null;
  unitGross: string | null;
  unitTeam: string | null;
  projectName: string | null;
  budgetLineId: number | null;
  note: string | null;
}

export interface ItemDetail {
  item: typeof inventoryItem.$inferSelect;
  hasImage: boolean;
  stock: (StockRow & { label: string })[];
  onHandMilli: number;
  boughtMilli: number;
  unitE4: number | null;
  complete: boolean;
  history: PricePoint[];
  movements: MovementRow[];
  /** A made item: what it is made of, priced. */
  bom: Bom | null;
  /** The made items this one is a part of. */
  usedIn: { id: number; name: string }[];
}

export async function getItem(itemId: number, query: PriceQuery): Promise<ItemDetail> {
  const [item] = await db.select().from(inventoryItem).where(eq(inventoryItem.id, itemId));
  if (!item) throw notFound("Item");
  const data = await loadInventory();
  const on = query.on ?? today();
  const ctx = costContext(data, query.basis);
  const labels = new Map((await listLocations()).map((l) => [l.code, l.label]));
  const stock = stockRows(data.movements.filter((m) => m.itemId === itemId));
  const cost = unitCost(itemId, ctx, query.method, on);
  const [image] = await db.select({ id: itemImage.itemId }).from(itemImage).where(eq(itemImage.itemId, itemId));
  const rows = await db
    .select({ movement: stockMovement, projectName: project.name })
    .from(stockMovement)
    .leftJoin(project, eq(stockMovement.projectId, project.id))
    .where(eq(stockMovement.itemId, itemId))
    .orderBy(desc(stockMovement.occurredOn), desc(stockMovement.id))
    .limit(200);
  const made = data.parts.some((p) => p.componentId === itemId);
  const itemsById = new Map(data.items.map((i) => [i.id, i]));

  return {
    item,
    hasImage: image !== undefined,
    stock: stock.map((s) => ({ ...s, label: labels.get(s.location) ?? s.location })),
    onHandMilli: onHandMilli(stock, itemId),
    boughtMilli: receivedMilli(data.movements, itemId),
    unitE4: cost.unitE4,
    complete: cost.complete,
    history: priceHistory(data.movements, itemId, query.basis),
    movements: rows.map(({ movement: m, projectName }) => ({
      id: m.id,
      kind: m.kind,
      on: m.occurredOn,
      quantity: m.quantity,
      location: labels.get(m.location) ?? m.location,
      spot: m.spot,
      toLocation: m.toLocation === null ? null : (labels.get(m.toLocation) ?? m.toLocation),
      toSpot: m.toSpot,
      unitNet: m.unitNet,
      unitGross: m.unitGross,
      unitTeam: m.unitTeam,
      projectName,
      budgetLineId: m.budgetLineId,
      note: m.note,
    })),
    bom: made ? bom(itemId, ctx, query.method, on) : null,
    usedIn: data.parts
      .filter((p) => p.partId === itemId)
      .map((p) => ({ id: p.componentId, name: itemsById.get(p.componentId)?.name ?? `#${p.componentId}` })),
  };
}

// --- pictures -------------------------------------------------------------------------------------

/** The first bytes of a file tell what it really is, whatever it is called. */
function looksLike(mime: string, bytes: Buffer): boolean {
  if (mime === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP";
}

function decodePicture(label: string, text: string, mime: string, max: number): Buffer {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text)) throw invalid(`The ${label} picture is not valid base64`);
  const bytes = Buffer.from(text, "base64");
  if (bytes.length === 0 || bytes.length > max) throw invalid(`The ${label} picture must be at most ${Math.round(max / 1000)} KB`);
  if (!looksLike(mime, bytes)) throw invalid(`The ${label} picture is not really a ${mime} file`);
  return bytes;
}

export async function setImage(itemId: number, input: { mime: string; full: string; thumb: string }) {
  const actor = await assertCanManageInventory();
  const full = decodePicture("full-size", input.full, input.mime, IMAGE_LIMITS.full);
  const thumb = decodePicture("small", input.thumb, input.mime, IMAGE_LIMITS.thumb);
  await runWrite(actor, async (tx) => {
    const [target] = await tx.select({ id: inventoryItem.id }).from(inventoryItem).where(eq(inventoryItem.id, itemId));
    if (!target) throw notFound("Item");
    await tx
      .insert(itemImage)
      .values({ itemId, mime: input.mime, full, thumb })
      .onConflictDoUpdate({ target: itemImage.itemId, set: { mime: input.mime, full, thumb } });
    await tx.update(inventoryItem).set({ imageUpdatedAt: sql`now()` }).where(eq(inventoryItem.id, itemId));
  });
}

export async function removeImage(itemId: number) {
  const actor = await assertCanManageInventory();
  await runWrite(actor, async (tx) => {
    const [target] = await tx.select({ id: inventoryItem.id }).from(inventoryItem).where(eq(inventoryItem.id, itemId));
    if (!target) throw notFound("Item");
    await tx.delete(itemImage).where(eq(itemImage.itemId, itemId));
    await tx.update(inventoryItem).set({ imageUpdatedAt: null }).where(eq(inventoryItem.id, itemId));
  });
}

export async function getImage(itemId: number, size: "full" | "thumb") {
  const [row] = await db
    .select({ mime: itemImage.mime, data: size === "full" ? itemImage.full : itemImage.thumb, updatedAt: inventoryItem.imageUpdatedAt })
    .from(itemImage)
    .innerJoin(inventoryItem, eq(inventoryItem.id, itemImage.itemId))
    .where(eq(itemImage.itemId, itemId));
  if (!row) throw notFound("Picture");
  return { mime: row.mime, data: row.data, version: row.updatedAt?.getTime() ?? 0 };
}
