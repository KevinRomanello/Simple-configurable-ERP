import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { id, shortText } from "../../core/validation";
import { createSupplier, deleteSupplier, listSuppliers } from "./suppliers.service";

export async function suppliersRoutes(app: FastifyInstance) {
  app.get("/suppliers", () => listSuppliers());
  app.post("/suppliers", async (request, reply) =>
    reply.code(201).send(await createSupplier(z.object({ name: shortText() }).parse(request.body).name)),
  );
  app.delete("/suppliers/:id", async (request, reply) => {
    await deleteSupplier(z.object({ id }).parse(request.params).id);
    return reply.code(204).send();
  });
}
