import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../../core/errors";
import { activeStorage } from "./appmodules.context";
import { activeOf, moduleStates, offModuleOf, partOfUrl, readModules, setModule } from "./appmodules.service";

/**
 * Plugged in before the routes (app.ts). It reads the switches once and keeps who is on for the whole request (`currentActive()`): an
 * address of a module that is turned off, or of a bridge with one of its modules off, answers 404, as if it were not there
 * (docs/moduli-architettura.md, §8). The people who are signed in find out what is on in GET /api/me.
 */
export function addModuleGate(app: FastifyInstance) {
  app.addHook("onRequest", (request, _reply, done) => {
    moduleStates().then((states) => {
      const active = activeOf(states);
      const part = partOfUrl(request.url);
      const off = part && offModuleOf(part, active);
      if (off) done(new AppError(404, `The ${off} module is turned off`, "module-off"));
      else activeStorage.run(active, done);
    }, done);
  });
}

export async function appModulesRoutes(app: FastifyInstance) {
  app.get("/modules", async () => readModules());

  app.patch("/modules/:key", async (request, reply) => {
    const { key } = z.object({ key: z.string().max(50) }).parse(request.params);
    await setModule(key, z.object({ enabled: z.boolean() }).parse(request.body).enabled);
    return reply.code(204).send();
  });
}
