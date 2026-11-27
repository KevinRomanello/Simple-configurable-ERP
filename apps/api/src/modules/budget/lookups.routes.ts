import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getFixedSponsorRates, getSettings, getVatRules, listPriorities, updateCalculation } from "./lookups.service";

const percent = z.number().min(0).max(100).refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-9, "At most two decimals");
const compare = z.enum(["day", "month"]);

// The budget's lists and switches, under /api/budget (app.ts gives the prefix): anyone signed in reads them, only an admin changes the
// switches (the service checks it).
export async function budgetLookupsRoutes(app: FastifyInstance) {
  app.get("/lookups/priorities", () => listPriorities());
  app.get("/lookups/sponsor-rates", () => getFixedSponsorRates());
  app.get("/lookups/vat-rules", () => getVatRules());
  app.get("/lookups/settings", () => getSettings());
  app.patch("/settings/calculation", async (request, reply) => {
    const body = z
      .object({
        varianceThreshold: z.number().min(0).max(1).optional(),
        vatBaseWhenTotalSponsor: z.enum(["net", "net-minus-sponsor"]).optional(),
        inflowVatRate: percent.optional(),
        bankCompare: z.object({ summary: compare.optional(), timeline: compare.optional() }).optional(),
      })
      .parse(request.body);
    await updateCalculation(body);
    return reply.code(204).send();
  });
}
