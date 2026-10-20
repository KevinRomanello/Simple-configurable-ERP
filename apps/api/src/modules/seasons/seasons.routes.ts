import type { FastifyInstance } from "fastify";
import { getCurrentSeason } from "./seasons.service";

export async function seasonsRoutes(app: FastifyInstance) {
  app.get("/seasons/current", () => getCurrentSeason());
}
