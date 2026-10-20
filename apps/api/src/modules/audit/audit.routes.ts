import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { id, lookupCode, pageSize } from "../../core/validation";
import { listHistory } from "./audit.service";

export async function auditRoutes(app: FastifyInstance) {
  app.get("/audit", (request) => {
    const query = z
      .object({
        table: lookupCode.optional(),
        rowId: id.optional(),
        actorId: id.optional(),
        before: id.optional(),
        limit: pageSize.default(100),
      })
      .parse(request.query);
    return listHistory(query);
  });
}
