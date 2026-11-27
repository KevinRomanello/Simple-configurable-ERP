import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { id } from "../../core/validation";
import { receiptOfPurchaseInput } from "../../modules/inventory/inventory.public";
import { listPending, listProjects, receiveFromLine } from "./pending.service";

const lineParam = z.object({ lineId: id });

// What needs both the inventory and the budget, under /api/inventory-budget (app.ts gives the prefix). The services check who may: the people
// who keep the inventory.
export async function inventoryBudgetRoutes(app: FastifyInstance) {
  app.get("/pending", () => listPending());
  app.get("/projects", () => listProjects());
  app.post("/pending/:lineId/receive", async (request, reply) =>
    reply.code(201).send(await receiveFromLine(lineParam.parse(request.params).lineId, receiptOfPurchaseInput.parse(request.body))),
  );
}
