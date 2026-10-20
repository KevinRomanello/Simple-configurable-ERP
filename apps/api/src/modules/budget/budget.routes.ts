import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { id } from "../../core/validation";
import {
  createLineInput, createProjectInput, updateLineInput, updateProjectInput,
} from "./budget.schema";
import {
  createLine, createProject, deleteLine, deleteProject, getAreaSheet, listAreas, updateLine,
  updateProject,
} from "./budget.service";

const idParam = z.object({ id });

export async function budgetRoutes(app: FastifyInstance) {
  app.get("/areas", () => listAreas());
  app.get("/areas/:code/sheet", (request) => {
    const { code } = z.object({ code: z.string() }).parse(request.params);
    return getAreaSheet(code);
  });

  app.post("/projects", async (request, reply) =>
    reply.code(201).send(await createProject(createProjectInput.parse(request.body))),
  );
  app.patch("/projects/:id", (request) =>
    updateProject(idParam.parse(request.params).id, updateProjectInput.parse(request.body)),
  );
  app.delete("/projects/:id", async (request, reply) => {
    await deleteProject(idParam.parse(request.params).id);
    return reply.code(204).send();
  });

  app.post("/projects/:id/lines", async (request, reply) =>
    reply.code(201).send(await createLine(idParam.parse(request.params).id, createLineInput.parse(request.body))),
  );
  app.patch("/lines/:id", (request) =>
    updateLine(idParam.parse(request.params).id, updateLineInput.parse(request.body)),
  );
  app.delete("/lines/:id", async (request, reply) => {
    await deleteLine(idParam.parse(request.params).id);
    return reply.code(204).send();
  });
}
