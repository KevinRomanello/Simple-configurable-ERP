import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { id, shortText } from "../../core/validation";
import { seasonStorage } from "./seasons.context";
import { createSeason, getCurrentSeason, listSeasons, updateSeason } from "./seasons.service";

const idParam = z.object({ id });
const car = shortText(60);

/**
 * Runs before every route: the season chosen in the menu comes in the X-Season header (its id) and
 * every service then works on it through getCurrentSeason(). Without the header: the season of today.
 */
export function addSeasonHook(app: FastifyInstance) {
  app.addHook("onRequest", (request, reply, done) => {
    const header = request.headers["x-season"];
    if (header === undefined) {
      seasonStorage.run(null, done);
      return;
    }
    if (typeof header !== "string" || !/^[1-9]\d{0,8}$/.test(header)) {
      void reply.code(400).send({ error: "Unknown season" });
      return;
    }
    seasonStorage.run(Number(header), done);
  });
}

export async function seasonsRoutes(app: FastifyInstance) {
  app.get("/seasons", () => listSeasons());
  app.get("/seasons/current", () => getCurrentSeason());
  app.post("/seasons", async (request, reply) => {
    const body = z.object({ startYear: z.number().int().min(2000).max(2100), car }).parse(request.body);
    return reply.code(201).send(await createSeason(body));
  });
  app.patch("/seasons/:id", (request) =>
    updateSeason(idParam.parse(request.params).id, z.object({ car, readOnly: z.boolean() }).partial().parse(request.body)),
  );
}
