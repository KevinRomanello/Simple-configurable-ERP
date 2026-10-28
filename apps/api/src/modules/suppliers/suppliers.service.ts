import { eq, sql } from "drizzle-orm";
import { conflict, forbidden, notFound } from "../../core/errors";
import { runWrite, type Tx } from "../../core/tx";
import { db } from "../../db/client";
import { lineFigures, supplier } from "../../db/schema";
import { canManageSuppliers, getCurrentUser } from "../auth/auth.service";

async function assertCanManageSuppliers() {
  const actor = await getCurrentUser();
  if (!(await canManageSuppliers(actor))) throw forbidden("You cannot change suppliers");
  return actor;
}

/** BOUGHT FROM: the single list of suppliers, A-Z without regard to case. */
export async function listSuppliers() {
  return db.select().from(supplier).orderBy(sql`lower(${supplier.name})`);
}

export async function createSupplier(name: string) {
  const actor = await assertCanManageSuppliers();
  return runWrite(actor, async (tx) => {
    const [existing] = await tx.select().from(supplier).where(sql`lower(${supplier.name}) = lower(${name})`);
    if (existing) throw conflict(`"${existing.name}" is already in the list`);
    const [created] = await tx.insert(supplier).values({ name }).returning();
    return created!;
  });
}

// A sponsor that gives goods is also a supplier of the same name (docs/sponsor-e-fondi.md): these two
// are what keeps the sponsor and its supplier together. They run inside the write that needs them.

/** The supplier with this name (in any case), made if it does not exist yet. */
export async function ensureSupplier(tx: Tx, name: string) {
  const find = () => tx.select().from(supplier).where(sql`lower(${supplier.name}) = lower(${name})`);
  const [existing] = await find();
  if (existing) return existing;
  const [created] = await tx.insert(supplier).values({ name }).onConflictDoNothing().returning();
  return created ?? (await find())[0]!; // somebody made it at the same moment
}

/** Gives a supplier the new name of its sponsor, unless another supplier already has that name. */
export async function renameSupplier(tx: Tx, from: string, to: string) {
  const byName = (name: string) => tx.select().from(supplier).where(sql`lower(${supplier.name}) = lower(${name})`);
  const [own] = await byName(from);
  const [taken] = await byName(to);
  if (!own || (taken && taken.id !== own.id)) return;
  await tx.update(supplier).set({ name: to }).where(eq(supplier.id, own.id));
}

/** Deletes a supplier no budget line refers to. */
export async function deleteSupplier(supplierId: number) {
  const actor = await assertCanManageSuppliers();
  await runWrite(actor, async (tx) => {
    const [target] = await tx.select().from(supplier).where(eq(supplier.id, supplierId));
    if (!target) throw notFound("Supplier");
    const [used] = await tx.select({ n: sql<number>`count(*)::int` }).from(lineFigures).where(eq(lineFigures.supplierId, supplierId));
    if ((used?.n ?? 0) > 0) throw conflict(`"${target.name}" is used by ${used?.n} budget lines`);
    await tx.delete(supplier).where(eq(supplier.id, supplierId));
  });
}
