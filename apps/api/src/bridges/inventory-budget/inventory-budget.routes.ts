import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { id } from "../../core/validation";
import { receiptOfPurchaseInput } from "../../modules/inventory/inventory.public";
import { listPending, listProjects, receiveFromLine } from "./pending.service";

const lineParam = z.object({ lineId: id });

// What needs both the inventory and the budget (the services check who may: the people who keep the inventory). PENDING and the projects are
// still at their old addresses (/inventory/…) until the next step moves them under /inventory-budget; the arrival for a line is new.
export async function inventoryBudgetRoutes(app: FastifyInstance) {
  app.get("/inventory/pending", () => listPending());
  app.get("/inventory/projects", () => listProjects());
  app.post("/inventory-budget/pending/:lineId/receive", async (request, reply) =>
    reply.code(201).send(await receiveFromLine(lineParam.parse(request.params).lineId, receiptOfPurchaseInput.parse(request.body))),
  );
}
