import type { FastifyInstance } from "fastify";
import {
  getSettings,
  getVatRules,
  listCategories,
  listPriorities,
  listVatRates,
} from "./lookups.service";

export async function lookupsRoutes(app: FastifyInstance) {
  app.get("/lookups/categories", () => listCategories());
  app.get("/lookups/priorities", () => listPriorities());
  app.get("/lookups/vat-rates", () => listVatRates());
  app.get("/lookups/vat-rules", () => getVatRules());
  app.get("/lookups/settings", () => getSettings());
}
