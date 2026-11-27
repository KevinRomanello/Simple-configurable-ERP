import type { FastifyInstance } from "fastify";
import {
  listCategories,
  listVatRates,
} from "./lookups.service";

export async function lookupsRoutes(app: FastifyInstance) {
  app.get("/lookups/categories", () => listCategories());
  app.get("/lookups/vat-rates", () => listVatRates());
}
