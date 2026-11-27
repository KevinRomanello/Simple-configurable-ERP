import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { id } from "../../core/validation";
import { listCategoryDefaults, setCategoryDefault } from "./category-voce.service";
import { deleteInflows, listRelated } from "./inflow-delete.service";
import { listPayableLines, listToLink, listToPay, payLines, setEntryLines } from "./payments.service";
import { listReceivable, receiveInflow, unreceiveInflow } from "./receipts.service";
import { categoryDefaultInput, linesInput, payInput, receiveInput, toPayQuery } from "./treasury-budget.schema";

const idParam = z.object({ id });

// What needs both the register and the budget, under /api/treasury-budget (app.ts gives the prefix). The services check who may: the treasury and
// the admins, and the sponsors for the inflows.
export async function treasuryBudgetRoutes(app: FastifyInstance) {
  // the payments of the register tied to the lines of the budget
  app.get("/payable-lines", () => listPayableLines());
  app.put("/entries/:id/lines", async (request, reply) => {
    await setEntryLines(idParam.parse(request.params).id, linesInput.parse(request.body).lines);
    return reply.code(204).send();
  });
  // TO PAY: what the team still owes of the lines bought, the button that pays them, and the payments to tie
  app.get("/to-pay", (request) => listToPay(toPayQuery.parse(request.query).allSeasons !== undefined));
  app.post("/to-pay/pay", async (request, reply) => reply.code(201).send(await payLines(payInput.parse(request.body))));
  app.get("/to-link", () => listToLink());
  app.get("/category-voci", () => listCategoryDefaults());
  app.put("/category-voci/:id", async (request, reply) => {
    await setCategoryDefault(idParam.parse(request.params).id, categoryDefaultInput.parse(request.body).voceId);
    return reply.code(204).send();
  });

  // an expected inflow arrived: tie it to a movement of the register (new, or one that is already there)
  app.get("/inflows/receivable", () => listReceivable());
  app.post("/inflows/:id/receive", async (request, reply) => {
    await receiveInflow(idParam.parse(request.params).id, receiveInput.parse(request.body));
    return reply.code(204).send();
  });
  app.delete("/inflows/:id/receive", async (request, reply) => {
    await unreceiveInflow(idParam.parse(request.params).id);
    return reply.code(204).send();
  });
  // everything of one company (expected, actual, movements of the register) to delete it where the person chooses, in one go
  app.get("/inflows/related", (request) =>
    listRelated(
      z
        .object({ inflowId: id.optional(), cashEntryId: id.optional() })
        .refine((q) => (q.inflowId === undefined) !== (q.cashEntryId === undefined), "Give an inflowId or a cashEntryId")
        .parse(request.query),
    ),
  );
  app.post("/inflows/delete", async (request, reply) => {
    await deleteInflows(z.object({ inflowIds: z.array(id).max(200), cashEntryIds: z.array(id).max(200) }).parse(request.body));
    return reply.code(204).send();
  });
}
