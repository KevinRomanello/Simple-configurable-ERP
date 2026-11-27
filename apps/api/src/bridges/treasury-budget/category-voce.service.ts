import { asc, eq } from "drizzle-orm";
import { notFound } from "../../core/errors";
import { runWrite } from "../../core/tx";
import { db } from "../../db/client";
import { category } from "../../db/schema/platform";
import { categoryVoce } from "../../db/schema/treasury-budget";
import { assertCanManageCash, assertListed } from "../../modules/treasury/treasury.public";

// The Voce a payment starts from, for each category of the budget (TO PAY offers it when the lines of that category are paid).

/** Every category of the budget with the Voce a payment for one of its lines starts from (TO PAY), or null. */
export async function listCategoryDefaults() {
  await assertCanManageCash();
  const rows = await db
    .select({ id: category.id, name: category.name, voceId: categoryVoce.voceId })
    .from(category)
    .leftJoin(categoryVoce, eq(categoryVoce.categoryId, category.id))
    .orderBy(asc(category.position), asc(category.id));
  return rows.map((c) => ({ categoryId: c.id, name: c.name, voceId: c.voceId }));
}

export async function setCategoryDefault(categoryId: number, voceId: number | null) {
  const actor = await assertCanManageCash();
  await runWrite(actor, async (tx) => {
    await assertListed(tx, voceId, null);
    const [found] = await tx.select({ id: category.id }).from(category).where(eq(category.id, categoryId));
    if (!found) throw notFound("Category");
    if (voceId === null) await tx.delete(categoryVoce).where(eq(categoryVoce.categoryId, categoryId));
    else await tx.insert(categoryVoce).values({ categoryId, voceId }).onConflictDoUpdate({ target: categoryVoce.categoryId, set: { voceId } });
  });
}
