import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../../core/errors";
import { isModuleOn, moduleOfUrl, readModules, setModule } from "./appmodules.service";

/**
 * Plugged in before the routes of the modules (app.ts): an address of a module that is turned off answers 404, as if the
 * module were not there. The people who are signed in find out which modules are on in GET /api/me.
 */
export function addModuleGate(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    const module = moduleOfUrl(request.url);
    if (module && !(await isModuleOn(module.key))) throw new AppError(404, `The ${module.label} module is turned off`, "module-off");
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
