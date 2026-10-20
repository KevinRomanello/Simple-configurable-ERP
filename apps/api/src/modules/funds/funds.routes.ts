import { PHASES } from "@erp/calc";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { decimal, id, isoDate, LIMITS, shortText } from "../../core/validation";
import {
  createContract, deleteContract, deleteFund, listContracts, listFunds, updateFund,
} from "./funds.service";

const phase = z.enum(PHASES);
const idParam = z.object({ id });

export async function fundsRoutes(app: FastifyInstance) {
  app.get("/funds", (request) =>
    listFunds(z.object({ phase: phase.optional() }).parse(request.query).phase),
  );
  app.patch("/funds/:id", (request) =>
    updateFund(
      idParam.parse(request.params).id,
      z.object({ paysVatEstimate: z.boolean(), paysVatActual: z.boolean() }).partial().parse(request.body),
    ),
  );
  app.delete("/funds/:id", async (request, reply) => {
    await deleteFund(idParam.parse(request.params).id);
    return reply.code(204).send();
  });

  app.get("/funds/contracts", (request) =>
    listContracts(z.object({ phase }).parse(request.query).phase),
  );
  app.post("/funds/contracts", async (request, reply) =>
    reply.code(201).send(
      await createContract(
        z
          .object({
            phase,
            fundName: shortText(),
            amount: decimal(2, LIMITS.money),
            inflowDate: isoDate.nullish(),
          })
          .parse(request.body),
      ),
    ),
  );
  app.delete("/funds/contracts/:id", async (request, reply) => {
    await deleteContract(idParam.parse(request.params).id);
    return reply.code(204).send();
  });
}
