import type { Me } from "../api/types";
import { moduleOn } from "./modules";

/** The sections of Settings: what is kept for the budget, for the inventory, for the register of the treasury, and the App (how the site looks for each person, and the switches of the site: which modules are on). */
export type SettingsSection = "budget" | "inventory" | "register" | "registry" | "app";

export const SECTION_LABELS: Record<SettingsSection, string> = {
  budget: "Budget",
  inventory: "Inventory",
  register: "Register",
  registry: "Registry",
  app: "App",
};

type Permissions = Pick<Me["permissions"], "canManageSettings" | "canManageInventory" | "canManageCash">;

/**
 * The sections a person can use, in the order of the tabs. The admin has them all (the Registry one only while that module is on); a user keeps the lists of the inventory
 * (and, with the treasury box, those of the register); everyone can choose how the site looks, and that is all a viewer has.
 */
export function settingsSections(can: Permissions, modules: Record<string, boolean> = {}): SettingsSection[] {
  const sections: [SettingsSection, boolean][] = [
    ["budget", can.canManageSettings],
    ["inventory", can.canManageSettings || can.canManageInventory],
    ["register", can.canManageSettings || can.canManageCash],
    // the people of the registry, the roles of the ERP taken from it and the keys of the services: admins
    ["registry", can.canManageSettings && moduleOn({ modules }, "registry")],
    ["app", true],
  ];
  return sections.filter(([, allowed]) => allowed).map(([section]) => section);
}

/**
 * The section to show: the one the address asks for when the person can use it, otherwise the first of theirs.
 * `appearance`, what «App» was called, still leads there.
 */
export function currentSection(allowed: SettingsSection[], asked: string | undefined): SettingsSection {
  const wanted = asked === "appearance" ? "app" : asked;
  return allowed.find((section) => section === wanted) ?? allowed[0]!;
}
