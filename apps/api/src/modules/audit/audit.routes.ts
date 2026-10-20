import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { id } from "../../core/validation";
import { listHistory } from "./audit.service";

export async function auditRoutes(app: FastifyInstance) {
  app.get("/audit", (request) => {
    const query = z
      .object({
        table: z.string().optional(),
        rowId: id.optional(),
        actorId: id.optional(),
        before: id.optional(),
        limit: z.coerce.number().int().min(1).max(500).default(100),
      })
      .parse(request.query);
    return listHistory(query);
  });
}
