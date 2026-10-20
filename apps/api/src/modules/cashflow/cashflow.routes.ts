import { PHASES } from "@erp/calc";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { decimal, id, isoDate } from "../../core/validation";
import { clearBank, createInflow, deleteInflow, getBank, listInflows, setBank } from "./cashflow.service";

const phase = z.enum(PHASES);

export async function cashflowRoutes(app: FastifyInstance) {
  app.get("/inflows", (request) => listInflows(z.object({ phase }).parse(request.query).phase));
  app.post("/inflows", async (request, reply) =>
    reply.code(201).send(
      await createInflow(
        z
          .object({ phase, sourceName: z.string().trim().min(1), amount: decimal(2), inflowDate: isoDate.nullish() })
          .parse(request.body),
      ),
    ),
  );
  app.delete("/inflows/:id", async (request, reply) => {
    await deleteInflow(z.object({ id }).parse(request.params).id);
    return reply.code(204).send();
  });

  app.get("/bank", () => getBank());
  app.put("/bank", (request) =>
    setBank(z.object({ amount: decimal(2), asOfDate: isoDate.nullish() }).parse(request.body)),
  );
  app.delete("/bank", async (_request, reply) => {
    await clearBank();
    return reply.code(204).send();
  });
}
