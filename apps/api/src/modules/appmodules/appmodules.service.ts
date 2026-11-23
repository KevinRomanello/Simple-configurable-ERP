import { eq } from "drizzle-orm";
import { notFound } from "../../core/errors";
import { runWrite } from "../../core/tx";
import { db } from "../../db/client";
import { appModule } from "../../db/schema";
import { getCurrentUser, requireAdmin } from "../auth/auth.service";

// The parts of the ERP an admin can turn off (Settings › App › Modules, docs/moduli.md). Off means the module's
// addresses answer «not found», the site does not show it (menu, pages, settings), and what it keeps stays where it is
// until it is turned on again. The modules do not know they can be turned off: this one only knows their addresses.

export interface ModuleDef {
  key: string;
  label: string;
  description: string;
  /** The API addresses of the module (the addresses of the people and of the services, `/ext/…`, reach the API at these too). */
  prefixes: string[];
}

/** The modules that can be turned off. A new one is a new entry here and the matching group of the menu in the site. */
export function listModuleDefs(): ModuleDef[] {
  // HARDCODED: the modules of the ERP, read from the code that registers their routes (GET /api/modules)
  return [
    {
      key: "registry",
      label: "Registry",
      description: "The registries of the team (the people, the sponsors…), the forms that fill them in, the keys and webhooks for n8n, and the roles of the ERP taken from them.",
      prefixes: ["/api/registry", "/api/role-sync"],
    },
  ];
}

/** Which modules are on, by key: one that was never turned off is on. */
export async function moduleStates(reader: Pick<typeof db, "select"> = db): Promise<Record<string, boolean>> {
  const off = new Set((await reader.select({ key: appModule.key }).from(appModule).where(eq(appModule.enabled, false))).map((r) => r.key));
  return Object.fromEntries(listModuleDefs().map((m) => [m.key, !off.has(m.key)]));
}

export async function isModuleOn(key: string): Promise<boolean> {
  return (await moduleStates())[key] !== false;
}

/** The module an API address belongs to, if it belongs to one. */
export function moduleOfUrl(url: string): ModuleDef | undefined {
  const path = url.split("?")[0]!;
  return listModuleDefs().find((m) => m.prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`)));
}

/** What the Settings page shows: every module with its state (admins). */
export async function readModules() {
  requireAdmin(await getCurrentUser());
  const states = await moduleStates();
  return listModuleDefs().map(({ key, label, description }) => ({ key, label, description, enabled: states[key] !== false }));
}

/** Turns a module on or off (admins); the change goes into the History. */
export async function setModule(key: string, enabled: boolean) {
  const actor = await getCurrentUser();
  requireAdmin(actor);
  if (!listModuleDefs().some((m) => m.key === key)) throw notFound("Module");
  await runWrite(actor, (tx) => tx.insert(appModule).values({ key, enabled }).onConflictDoUpdate({ target: appModule.key, set: { enabled } }));
}
