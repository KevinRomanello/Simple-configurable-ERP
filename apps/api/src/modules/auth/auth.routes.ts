import type { FastifyInstance } from "fastify";
import { getCurrentUser } from "./auth.service";

export async function authRoutes(app: FastifyInstance) {
  app.get("/me", () => getCurrentUser());
}
