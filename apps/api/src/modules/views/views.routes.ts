import { PHASES, PRIORITIES } from "@erp/calc";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { lookupCode } from "../../core/validation";
import {
  getCashFlowView, getFundAnalysis, getFundsSummary, getGantt, getItemsView, getSupplierAnalysis,
  getTotals, getVatReport,
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
  app.get("/views/totals", () => getTotals());
  app.get("/views/analysis/funds", () => getFundAnalysis());
  app.get("/views/analysis/suppliers", () => getSupplierAnalysis());
  app.get("/views/items", (request) => getItemsView(itemsQuery.parse(request.query)));
  app.get("/views/vat-report", (request) =>
    getVatReport(z.object({ area: lookupCode }).parse(request.query).area),
  );
}
