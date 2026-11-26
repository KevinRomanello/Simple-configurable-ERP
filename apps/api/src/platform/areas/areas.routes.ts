import type { FastifyInstance } from "fastify";
import { listAreas } from "./areas.service";

export async function areasRoutes(app: FastifyInstance) {
  app.get("/areas", () => listAreas());
}
