import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { id, shortText } from "../../core/validation";
import { ITEM_FIELDS } from "../lookups/defaults";
import {
  createCategory,
  createLocation,
  createUnit,
  createVatRate,
  deleteCategory,
  deleteLocation,
  deleteUnit,
  deleteVatRate,
  orderCategories,
  orderLocations,
  readSettings,
  renameUnit,
  setUncategorizedFields,
  updateCalculation,
  updateCategory,
  updateLocation,
} from "./settings.service";

// The Settings page (admin only: the service checks it). docs/impostazioni.md
const idParam = z.object({ id });
const name = shortText(60);
const fields = z.array(z.enum(ITEM_FIELDS)).max(ITEM_FIELDS.length);
const order = z.object({ ids: z.array(id).max(500) });
const percent = z.number().min(0).max(100).refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-9, "At most two decimals");
const compare = z.enum(["day", "month"]);

export async function settingsRoutes(app: FastifyInstance) {
  app.get("/settings", () => readSettings());

  app.post("/settings/categories", async (request, reply) =>
    reply.code(201).send(await createCategory(z.object({ name, fields: fields.optional() }).parse(request.body))),
  );
  app.patch("/settings/categories/:id", async (request, reply) => {
    await updateCategory(idParam.parse(request.params).id, z.object({ name: name.optional(), fields: fields.optional() }).parse(request.body));
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
  app.put("/settings/uncategorized-fields", async (request, reply) => {
    await setUncategorizedFields(z.object({ fields }).parse(request.body).fields);
    return reply.code(204).send();
  });

  app.post("/settings/vat-rates", async (request, reply) =>
    reply.code(201).send(await createVatRate(z.object({ rate: percent }).parse(request.body).rate)),
  );
  app.delete("/settings/vat-rates/:id", async (request, reply) => {
    await deleteVatRate(idParam.parse(request.params).id);
    return reply.code(204).send();
  });

  app.post("/settings/units", async (request, reply) =>
    reply.code(201).send(await createUnit(z.object({ name: shortText(20) }).parse(request.body).name)),
  );
  app.patch("/settings/units/:id", async (request, reply) => {
    await renameUnit(idParam.parse(request.params).id, z.object({ name: shortText(20) }).parse(request.body).name);
    return reply.code(204).send();
  });
  app.delete("/settings/units/:id", async (request, reply) => {
    await deleteUnit(idParam.parse(request.params).id);
    return reply.code(204).send();
  });

  app.post("/settings/locations", async (request, reply) =>
    reply.code(201).send(await createLocation(z.object({ site: name, room: name }).parse(request.body))),
  );
  app.patch("/settings/locations/:id", async (request, reply) => {
    await updateLocation(idParam.parse(request.params).id, z.object({ site: name.optional(), room: name.optional() }).parse(request.body));
    return reply.code(204).send();
  });
  app.delete("/settings/locations/:id", async (request, reply) => {
    await deleteLocation(idParam.parse(request.params).id);
    return reply.code(204).send();
  });
  app.put("/settings/locations/order", async (request, reply) => {
    await orderLocations(order.parse(request.body).ids);
    return reply.code(204).send();
  });

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
