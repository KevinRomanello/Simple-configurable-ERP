import { FUND_TYPES, PHASES } from "@erp/calc";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { decimal, id, isoDate, LIMITS, optionalText, shortText } from "../../core/validation";
import { clearContract, createFund, deleteFund, listFunds, setContract, updateFund } from "./funds.service";

const phase = z.enum(PHASES);
const idParam = z.object({ id });

// A sponsor's definition. A new one is a plain fund unless said otherwise; its VAT rate must be chosen.
const sponsor = {
  name: shortText(),
  type: z.enum(FUND_TYPES),
  vatRate: z.number().min(0).max(100).nullable(),
  group: optionalText(60),
};
const contractFields = {
  phase,
  amount: decimal(2, LIMITS.money),
  inflowDate: isoDate.nullish(),
};
// the money a new sponsor brings, up to one contract per phase
const createFundInput = z
  .object(sponsor)
  .partial({ type: true, vatRate: true, group: true })
  .extend({ contracts: z.array(z.object(contractFields)).max(PHASES.length).optional() });

export async function fundsRoutes(app: FastifyInstance) {
  app.get("/funds", (request) =>
    listFunds(z.object({ phase: phase.optional() }).parse(request.query).phase),
  );
  app.post("/funds", async (request, reply) => {
    const { contracts = [], ...body } = createFundInput.parse(request.body);
    return reply.code(201).send(
      await createFund(
        { type: "fund", vatRate: null, group: null, ...body },
        contracts.map((c) => ({ ...c, inflowDate: c.inflowDate ?? null })),
      ),
    );
  });
  app.patch("/funds/:id", (request) =>
    updateFund(idParam.parse(request.params).id, z.object(sponsor).partial().parse(request.body)),
  );
  app.delete("/funds/:id", async (request, reply) => {
    await deleteFund(idParam.parse(request.params).id);
    return reply.code(204).send();
  });

  // the money of a sponsor: one value and one date per phase
  app.put("/funds/:id/contracts/:phase", (request) => {
    const params = z.object({ id, phase }).parse(request.params);
    const body = z.object({ amount: contractFields.amount, inflowDate: contractFields.inflowDate }).parse(request.body);
    return setContract(params.id, params.phase, { amount: body.amount, inflowDate: body.inflowDate ?? null });
  });
  app.delete("/funds/:id/contracts/:phase", async (request, reply) => {
    const params = z.object({ id, phase }).parse(request.params);
    await clearContract(params.id, params.phase);
    return reply.code(204).send();
  });
}
