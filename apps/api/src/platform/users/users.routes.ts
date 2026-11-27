import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { id, shortText } from "../../core/validation";
import { createToken, listTokens, renameToken, revokeToken } from "../auth/api-tokens.service";
import { createUser, listFlags, listUsers, updateUser } from "./users.service";

export async function usersRoutes(app: FastifyInstance) {
  app.get("/users", () => listUsers());
  app.get("/flags", () => listFlags());
  app.post("/users", async (request, reply) =>
    reply.code(201).send(await createUser(z.object({ email: z.email().max(254), name: shortText(200), role: z.enum(["admin", "pm", "viewer"]) }).parse(request.body))),
  );

  // keys for services, admins only (docs/anagrafiche.md, §10.1)
  app.get("/tokens", () => listTokens());
  app.post("/tokens", async (request, reply) => reply.code(201).send(await createToken(z.object({ name: shortText(100), userId: id }).parse(request.body))));
  app.patch("/tokens/:id", (request) => renameToken(z.object({ id }).parse(request.params).id, z.object({ name: shortText(100) }).parse(request.body).name));
  app.delete("/tokens/:id", async (request, reply) => {
    await revokeToken(z.object({ id }).parse(request.params).id);
    return reply.code(204).send();
  });
  app.patch("/users/:id", (request) =>
    updateUser(
      z.object({ id }).parse(request.params).id,
      z
        .object({
          role: z.enum(["admin", "pm", "viewer"]),
          flags: z.array(shortText(60)),
          active: z.boolean(),
          areaIds: z.array(id),
        })
        .partial()
        .parse(request.body),
    ),
  );
}
