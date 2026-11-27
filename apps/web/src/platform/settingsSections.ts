import { byOrder, type Manifest, type SettingsSection } from "./manifest";
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
