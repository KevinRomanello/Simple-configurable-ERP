import { forbidden } from "../../core/errors";
import { canManageInventory, getCurrentUser } from "../../platform/auth/auth.service";

/** Refuses the person who does not keep the inventory (who does, the inventory declares: `inventory.contract.ts`). */
export async function assertCanManageInventory() {
  const actor = await getCurrentUser();
  if (!(await canManageInventory(actor))) throw forbidden("You cannot change the inventory");
  return actor;
}
