import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { id } from "../../core/validation";
import { getRoleSync, previewRoleSync, setRoleSync, startRoleSync } from "./rolesync.service";

const choices = z
  .object({
    enabled: z.boolean(),
    activeViewId: id.nullable(),
    adminViewId: id.nullable(),
    pmViewId: id.nullable(),
    pmAreasFieldId: id.nullable(),
    treasuryViewId: id.nullable(),
    sponsorsViewId: id.nullable(),
  })
  .partial();

/** The roles of the ERP from the registry (docs/anagrafiche.md, §9). `adminEmails` stay admins whatever the registry says. */
export async function rolesyncRoutes(app: FastifyInstance, { adminEmails }: { adminEmails: string[] }) {
  startRoleSync(adminEmails);
  app.get("/role-sync", () => getRoleSync());
  app.put("/role-sync", (request) => setRoleSync(choices.parse(request.body)));
  app.post("/role-sync/preview", (request) => previewRoleSync(choices.parse(request.body ?? {})));
}
