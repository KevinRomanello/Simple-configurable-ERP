import { eq } from "drizzle-orm";
import { activeOwners, ALL_ACTIVE, contracts, type Active } from "../../core/contracts";
import { notFound } from "../../core/errors";
import { runWrite } from "../../core/tx";
import { db } from "../../db/client";
import { appModule } from "../../db/schema/platform";
import { getCurrentUser, requireAdmin } from "../auth/auth.service";
import { bridgeInfo, currentActive, moduleInfo, type BridgeInfo, type ModuleInfo } from "../platform.public";

// The parts of the ERP an admin can turn off (Settings › App › Modules, docs/moduli.md and docs/moduli-architettura.md, §8). Off means the
// addresses of the module and of the bridges that need it answer «not found», the site does not show them (menu, pages, settings), the core
// stops asking them, and what they keep stays where it is until the module is turned on again. Each module and bridge presents itself in its
// contract (`moduleInfo`, `bridgeInfo`): this file knows no module.

/** The modules that can be turned off, in the order of the menu: each one is declared in its contract. */
export function listModuleDefs(): ModuleInfo[] {
  return contracts.declared(moduleInfo, ALL_ACTIVE).sort((a, b) => a.order - b.order);
}

/** The bridges: each one is on while the modules it joins are. */
export const listBridges = (): BridgeInfo[] => contracts.declared(bridgeInfo, ALL_ACTIVE);

/** Which modules are on, by key: one that was never turned off is on. One small read of the switches. */
export async function moduleStates(reader: Pick<typeof db, "select"> = db): Promise<Record<string, boolean>> {
  const off = new Set((await reader.select({ key: appModule.key }).from(appModule).where(eq(appModule.enabled, false))).map((r) => r.key));
  return Object.fromEntries(listModuleDefs().map((m) => [m.key, !off.has(m.key)]));
}

/** Who is on with these switches: the modules that are on, and the bridges whose modules are all on. */
export function activeOf(states: Record<string, boolean>): Active {
  const off = Object.keys(states).filter((key) => !states[key]);
  return activeOwners(off, Object.fromEntries(listBridges().map((b) => [b.key, b.needs])));
}

/** The module or the bridge an API address belongs to (`/api/<key>/…`), if it belongs to one. */
export function partOfUrl(url: string): { key: string; needs: string[] } | undefined {
  const key = /^\/api\/([\w-]+)/.exec(url.split("?")[0]!)?.[1];
  if (key === undefined) return undefined;
  const found = listModuleDefs().find((m) => m.key === key) ?? listBridges().find((b) => b.key === key);
  return found && { key, needs: "needs" in found ? found.needs : [key] };
}

/** The label of the first module this part needs that is off: what the answer «not found» names. */
export function offModuleOf(part: { needs: string[] }, active: Active): string | undefined {
  const key = part.needs.find((k) => !active.has(k));
  return key === undefined ? undefined : listModuleDefs().find((m) => m.key === key)?.label;
}

/** What GET /api/me says of the switches, from who is on for this request: every module and every bridge, on or off. */
export function switchesNow(): { modules: Record<string, boolean>; bridges: Record<string, boolean> } {
  const active = currentActive();
  return {
    modules: Object.fromEntries(listModuleDefs().map((m) => [m.key, active.has(m.key)])),
    bridges: Object.fromEntries(listBridges().map((b) => [b.key, active.has(b.key)])),
  };
}

/** What the Settings page shows: every module with its state, and what goes off with it (admins). */
export async function readModules() {
  requireAdmin(await getCurrentUser());
  const states = await moduleStates();
  return listModuleDefs().map(({ key, label, description }) => ({
    key,
    label,
    description,
    enabled: states[key] !== false,
    alsoOff: listBridges().filter((b) => b.needs.includes(key)).map((b) => b.hides),
  }));
}

/** Turns a module on or off (admins); the change goes into the History. A bridge has no switch: it follows its modules. */
export async function setModule(key: string, enabled: boolean) {
  const actor = await getCurrentUser();
  requireAdmin(actor);
  if (!listModuleDefs().some((m) => m.key === key)) throw notFound("Module");
  await runWrite(actor, (tx) => tx.insert(appModule).values({ key, enabled }).onConflictDoUpdate({ target: appModule.key, set: { enabled } }));
}
