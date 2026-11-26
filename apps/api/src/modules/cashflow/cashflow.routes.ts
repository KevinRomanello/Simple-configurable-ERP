import { PHASES } from "@erp/calc";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { decimal, id, isoDate, LIMITS, shortText } from "../../core/validation";
import { receiveInput } from "../cash/cash.schema";
import { clearBank, createInflow, deleteInflow, getBank, listInflows, listReceivable, receiveInflow, setBank, unreceiveInflow } from "./cashflow.service";
import { deleteInflows, listRelated } from "./inflow-delete.service";

const phase = z.enum(PHASES);

export async function cashflowRoutes(app: FastifyInstance) {
  app.get("/inflows", (request) => listInflows(z.object({ phase }).parse(request.query).phase));
  app.post("/inflows", async (request, reply) =>
    reply.code(201).send(
      await createInflow(
        z
          .object({ phase, sourceName: shortText(), amount: decimal(2, LIMITS.money), inflowDate: isoDate.nullish(), sponsorship: z.boolean().optional() })
          .parse(request.body),
      ),
    ),
  );
  // an expected inflow arrived: tie it to a movement of the register (new, or one that is already there)
  app.get("/inflows/receivable", () => listReceivable());
  app.post("/inflows/:id/receive", async (request, reply) => {
    await receiveInflow(z.object({ id }).parse(request.params).id, receiveInput.parse(request.body));
    return reply.code(204).send();
  });
  app.delete("/inflows/:id/receive", async (request, reply) => {
    await unreceiveInflow(z.object({ id }).parse(request.params).id);
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
  app.delete("/inflows/:id", async (request, reply) => {
    await deleteInflow(z.object({ id }).parse(request.params).id);
    return reply.code(204).send();
  });

  app.get("/bank", () => getBank());
  app.put("/bank", (request) =>
    setBank(z.object({ amount: decimal(2, LIMITS.money), asOfDate: isoDate.nullish() }).parse(request.body)),
  );
  app.delete("/bank", async (_request, reply) => {
    await clearBank();
    return reply.code(204).send();
  });
}
