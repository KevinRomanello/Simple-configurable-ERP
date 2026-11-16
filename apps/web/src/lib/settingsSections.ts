import type { Me } from "../api/types";

/** The sections of Settings: what is kept for the budget, for the inventory, for the register of the treasury, and how the site looks. */
export type SettingsSection = "budget" | "inventory" | "register" | "appearance";

export const SECTION_LABELS: Record<SettingsSection, string> = {
  budget: "Budget",
  inventory: "Inventory",
  register: "Register",
  appearance: "Appearance",
};

type Permissions = Pick<Me["permissions"], "canManageSettings" | "canManageInventory" | "canManageCash">;

/**
 * The sections a person can use, in the order of the tabs. The admin has them all; a user keeps the lists of the inventory
 * (and, with the treasury box, those of the register); everyone can choose how the site looks, and that is all a viewer has.
 */
export function settingsSections(can: Permissions): SettingsSection[] {
  const sections: [SettingsSection, boolean][] = [
    ["budget", can.canManageSettings],
    ["inventory", can.canManageSettings || can.canManageInventory],
    ["register", can.canManageSettings || can.canManageCash],
    ["appearance", true],
  ];
  return sections.filter(([, allowed]) => allowed).map(([section]) => section);
}

/** The section to show: the one the address asks for when the person can use it, otherwise the first of theirs. */
export function currentSection(allowed: SettingsSection[], asked: string | undefined): SettingsSection {
  return allowed.find((section) => section === asked) ?? allowed[0]!;
}
