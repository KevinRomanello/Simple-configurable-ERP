import { byOrder, type CoreList, type Manifest, type SettingsSection } from "./manifest";
import type { Me } from "./types";

/**
 * The sections of Settings a person can use, in the order of the tabs: each module that is on brings its own (the budget, the
 * inventory, the register of the treasury, the registry) and says who may use it; the platform brings the App one, for everyone.
 */
export function settingsSections(manifests: Manifest[], me: Me): SettingsSection[] {
  return manifests.flatMap((manifest) => manifest.settings ?? []).filter((section) => section.allowed(me)).sort(byOrder);
}

/**
 * The section to show: the one the address asks for when the person can use it, otherwise the first of theirs.
 * `appearance`, what «App» was called, still leads there.
 */
export function currentSection(allowed: string[], asked: string | undefined): string {
  const wanted = asked === "appearance" ? "app" : asked;
  return allowed.find((section) => section === wanted) ?? allowed[0]!;
}

/**
 * The lists of the core that no section of a module that is on shows (choice A of G8, docs/impostazioni.md): they are kept in Settings › App,
 * by who could keep them in their section (the categories: admins and users; the seasons and the VAT rates: admins).
 */
export function coreListsKeptInApp(manifests: Manifest[], me: Me): CoreList[] {
  const shown = new Set(manifests.flatMap((m) => m.settings ?? []).flatMap((s) => s.shows ?? []));
  const { canManageSettings, canManageInventory } = me.permissions;
  return (["seasons", "vatRates", "categories"] as const).filter(
    (list) => !shown.has(list) && (list === "categories" ? canManageSettings || canManageInventory : canManageSettings),
  );
}
