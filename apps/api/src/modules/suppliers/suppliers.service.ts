import { eq, sql } from "drizzle-orm";
import { conflict, forbidden, notFound } from "../../core/errors";
import { runWrite } from "../../core/tx";
import { db } from "../../db/client";
import { lineFigures, supplier } from "../../db/schema";
import { canWrite, getCurrentUser } from "../auth/auth.service";

async function assertCanManageShared() {
  const actor = await getCurrentUser();
  if (!(await canWrite(actor, null))) throw forbidden("You cannot change suppliers");
  return actor;
}

/** BOUGHT FROM: the single list of suppliers, A-Z without regard to case. */
export async function listSuppliers() {
  return db.select().from(supplier).orderBy(sql`lower(${supplier.name})`);
}

export async function createSupplier(name: string) {
  const actor = await assertCanManageShared();
  return runWrite(actor, async (tx) => {
    const [existing] = await tx.select().from(supplier).where(sql`lower(${supplier.name}) = lower(${name})`);
    if (existing) throw conflict(`"${existing.name}" is already in the list`);
    const [created] = await tx.insert(supplier).values({ name }).returning();
    return created!;
  });
}

/** Deletes a supplier no budget line refers to. */
export async function deleteSupplier(supplierId: number) {
  const actor = await assertCanManageShared();
  await runWrite(actor, async (tx) => {
    const [target] = await tx.select().from(supplier).where(eq(supplier.id, supplierId));
    if (!target) throw notFound("Supplier");
    const [used] = await tx.select({ n: sql<number>`count(*)::int` }).from(lineFigures).where(eq(lineFigures.supplierId, supplierId));
    if ((used?.n ?? 0) > 0) throw conflict(`"${target.name}" is used by ${used?.n} budget lines`);
    await tx.delete(supplier).where(eq(supplier.id, supplierId));
  });
}
