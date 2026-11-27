import type { FastifyInstance } from "fastify";
import { getHealth } from "./health.service";

// Routes stay thin: they only translate HTTP to a service call and back.
export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async (_request, reply) => {
    const health = await getHealth();
    return reply.code(health.ok ? 200 : 503).send(health);
  });
}
