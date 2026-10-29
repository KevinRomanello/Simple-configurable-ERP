import { and, eq } from "drizzle-orm";
import { invalid, notFound } from "../../core/errors";
import { runWrite } from "../../core/tx";
import { db } from "../../db/client";
import { inventoryItem, itemDatasheet, itemDatasheetFile } from "../../db/schema";
import { DATASHEET_LIMITS } from "./inventory.schema";
import { assertCanManageInventory } from "./items.service";

// The data sheets (PDF) of the items. The list of an item (getItem) says only what they are; the bytes
// are read here, one file at a time, when somebody opens one: loading them with the item would make
// every page slow.

/** A PDF starts with its own name: the first bytes tell what a file really is, whatever it is called. */
const isPdf = (bytes: Buffer) => bytes.subarray(0, 5).toString("latin1") === "%PDF-";

export async function addDatasheet(itemId: number, name: string, bytes: unknown) {
  const actor = await assertCanManageInventory();
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) throw invalid("Send the PDF file itself");
  if (bytes.length > DATASHEET_LIMITS.bytes) throw invalid(`A data sheet can be at most ${DATASHEET_LIMITS.bytes / 1_000_000} MB`);
  if (!isPdf(bytes)) throw invalid("This is not a PDF file");
  return runWrite(actor, async (tx) => {
    const [item] = await tx.select({ id: inventoryItem.id }).from(inventoryItem).where(eq(inventoryItem.id, itemId));
    if (!item) throw notFound("Item");
    const [sheet] = await tx.insert(itemDatasheet).values({ itemId, name, sizeBytes: bytes.length, uploadedBy: actor.id }).returning();
    await tx.insert(itemDatasheetFile).values({ datasheetId: sheet!.id, data: bytes });
    return sheet!;
  });
}

/** One data sheet with its bytes (the only place that reads them). */
export async function getDatasheet(datasheetId: number) {
  const [found] = await db
    .select({ name: itemDatasheet.name, data: itemDatasheetFile.data })
    .from(itemDatasheet)
    .innerJoin(itemDatasheetFile, eq(itemDatasheetFile.datasheetId, itemDatasheet.id))
    .where(eq(itemDatasheet.id, datasheetId));
  if (!found) throw notFound("Data sheet");
  return found;
}

export async function removeDatasheet(datasheetId: number) {
  const actor = await assertCanManageInventory();
  await runWrite(actor, async (tx) => {
    const removed = await tx.delete(itemDatasheet).where(and(eq(itemDatasheet.id, datasheetId))).returning({ id: itemDatasheet.id });
    if (removed.length === 0) throw notFound("Data sheet");
  });
}
