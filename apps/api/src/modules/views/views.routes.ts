import { PHASES, PRIORITIES } from "@erp/calc";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { id, lookupCode, shortText } from "../../core/validation";
import {
  getCarTotals, getCashFlowView, getFundAnalysis, getFundsSummary, getGantt, getItemsView, getSupplierAnalysis,
  getTotals, getVatReport, getYearTotals,
} from "./views.service";

const phaseQuery = z.object({ phase: z.enum(PHASES) });

const itemsQuery = z.object({
  // "Components,Asset"; absent or empty means every category.
  categories: z.string().max(2_000).default("").transform((s) => s.split(",").map((c) => c.trim()).filter(Boolean)),
  priority: z.enum(["all", ...PRIORITIES, "high-to-low", "low-to-high"]).default("all"),
  sort: z.enum(["estimate-date", "actual-date", "area-project"]).default("estimate-date"),
});

export async function viewsRoutes(app: FastifyInstance) {
  app.get("/views/funds-summary", (request) => getFundsSummary(phaseQuery.parse(request.query).phase));
  app.get("/views/cashflow", () => getCashFlowView());
  app.get("/views/gantt", (request) => getGantt(phaseQuery.parse(request.query).phase));
  // the three TOTAL pages choose their season, year or car on their own, whatever the menu says
  app.get("/views/totals", (request) => getTotals(z.object({ season: id.optional() }).parse(request.query).season));
  app.get("/views/totals/year", (request) =>
    getYearTotals(z.object({ year: z.coerce.number().int().min(2000).max(2100) }).parse(request.query).year),
  );
  app.get("/views/totals/car", (request) => getCarTotals(z.object({ car: shortText(60) }).parse(request.query).car));
  app.get("/views/analysis/funds", () => getFundAnalysis());
  app.get("/views/analysis/suppliers", () => getSupplierAnalysis());
  app.get("/views/items", (request) => getItemsView(itemsQuery.parse(request.query)));
  app.get("/views/vat-report", (request) =>
    getVatReport(z.object({ area: lookupCode }).parse(request.query).area),
  );
}
