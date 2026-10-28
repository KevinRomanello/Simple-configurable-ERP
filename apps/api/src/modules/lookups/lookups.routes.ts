import type { FastifyInstance } from "fastify";
import {
  getCategoryFields,
  getFixedSponsorRates,
  getSettings,
  getVatRules,
  listCategories,
  listLocations,
  listPriorities,
  listUnits,
  listVatRates,
} from "./lookups.service";

export async function lookupsRoutes(app: FastifyInstance) {
  app.get("/lookups/categories", () => listCategories());
  app.get("/lookups/priorities", () => listPriorities());
  app.get("/lookups/vat-rates", () => listVatRates());
  app.get("/lookups/sponsor-rates", () => getFixedSponsorRates());
  app.get("/lookups/vat-rules", () => getVatRules());
  app.get("/lookups/settings", () => getSettings());
  app.get("/lookups/locations", () => listLocations());
  app.get("/lookups/units", () => listUnits());
  app.get("/lookups/category-fields", () => getCategoryFields());
}
