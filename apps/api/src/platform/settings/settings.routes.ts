import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { id, shortText } from "../../core/validation";
import {
  createCategory,
  createVatRate,
  deleteCategory,
  deleteVatRate,
  orderCategories,
  readSettings,
  updateCategory,
  updateSite,
} from "./settings.service";

// The Settings page of the core (the service checks who: docs/impostazioni.md). The inventory's lists answer under /api/inventory.
const idParam = z.object({ id });
const name = shortText(60);
const order = z.object({ ids: z.array(id).max(500) });
const percent = z.number().min(0).max(100).refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-9, "At most two decimals");

export async function settingsRoutes(app: FastifyInstance) {
  app.get("/settings", () => readSettings());

  app.post("/settings/categories", async (request, reply) =>
    reply.code(201).send(await createCategory(z.object({ name }).parse(request.body))),
  );
  app.patch("/settings/categories/:id", async (request, reply) => {
    await updateCategory(idParam.parse(request.params).id, z.object({ name: name.optional() }).parse(request.body));
    return reply.code(204).send();
  });
  app.delete("/settings/categories/:id", async (request, reply) => {
    await deleteCategory(idParam.parse(request.params).id);
    return reply.code(204).send();
  });
  app.put("/settings/categories/order", async (request, reply) => {
    await orderCategories(order.parse(request.body).ids);
    return reply.code(204).send();
  });
  app.post("/settings/vat-rates", async (request, reply) =>
    reply.code(201).send(await createVatRate(z.object({ rate: percent }).parse(request.body).rate)),
  );
  app.delete("/settings/vat-rates/:id", async (request, reply) => {
    await deleteVatRate(idParam.parse(request.params).id);
    return reply.code(204).send();
  });

  app.patch("/settings/site", async (request, reply) => {
    await updateSite(z.object({ editOnPhone: z.boolean() }).parse(request.body));
    return reply.code(204).send();
  });
}
