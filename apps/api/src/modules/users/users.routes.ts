import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { id } from "../../core/validation";
import { listUsers, updateUser } from "./users.service";

export async function usersRoutes(app: FastifyInstance) {
  app.get("/users", () => listUsers());
  app.patch("/users/:id", (request) =>
    updateUser(
      z.object({ id }).parse(request.params).id,
      z
        .object({
          role: z.enum(["admin", "pm", "viewer"]),
          active: z.boolean(),
          areaIds: z.array(id),
        })
        .partial()
        .parse(request.body),
    ),
  );
}
