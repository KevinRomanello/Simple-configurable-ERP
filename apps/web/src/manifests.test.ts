import { describe, expect, it } from "vitest";
import { MANIFESTS } from "./manifests";
import { byOrder, manifestOn } from "./platform/manifest";
import { settingsSections } from "./platform/settingsSections";
import type { Me, Permissions } from "./platform/types";

// The manifests of the site as they are (docs/moduli-architettura.md, §7.2): what each person sees in Settings, the groups of the
// menu, the pages, and which bridges are on.

const NONE: Permissions = {
  canEditShared: false, canManageCash: false, canChangeInflows: false, canManageSuppliers: false,
  canManageInventory: false, canViewHistory: false, canManageUsers: false, canManageSettings: false,
};
const ALL: Permissions = Object.fromEntries(Object.keys(NONE).map((key) => [key, true])) as unknown as Permissions;
const person = (role: Me["role"], permissions: Partial<Permissions>, modules: Record<string, boolean> = {}) => ({ role, permissions: { ...NONE, ...permissions }, modules }) as Me;
const on = (me: Me) => MANIFESTS.filter((manifest) => manifestOn(manifest, me));
const sectionsOf = (me: Me) => settingsSections(on(me), me).map((s) => s.key);

describe("the sections of Settings, from the manifests", () => {
  it("gives the admin every section, the budget first and the look of the site last", () => {
    expect(sectionsOf(person("admin", ALL))).toEqual(["budget", "inventory", "register", "registry", "app"]);
  });

  it("leaves the Registry section out while that module is off, for the admin too", () => {
    expect(sectionsOf(person("admin", ALL, { registry: false }))).toEqual(["budget", "inventory", "register", "app"]);
  });

  it("gives a user the inventory, and the register only with the treasury box", () => {
    expect(sectionsOf(person("pm", { canManageInventory: true }))).toEqual(["inventory", "app"]);
    expect(sectionsOf(person("pm", { canManageInventory: true, canManageCash: true }))).toEqual(["inventory", "register", "app"]);
  });

  it("gives a viewer only the App section (how the site looks)", () => {
    expect(sectionsOf(person("viewer", {}))).toEqual(["app"]);
  });
});

describe("the menu and the pages, from the manifests", () => {
  it("draws the groups in the order of the sheets of the Excel file, then the ones it does not have", () => {
    const groups = MANIFESTS.flatMap((m) => m.menuGroups ?? []).sort(byOrder).map((g) => g.id);
    expect(groups).toEqual(["budget", "views", "cash", "treasury", "total", "inventory", "registry", "admin"]);
  });

  it("puts every entry in a group that exists, once per place", () => {
    const groups = new Set(MANIFESTS.flatMap((m) => m.menuGroups ?? []).map((g) => g.id));
    const entries = MANIFESTS.flatMap((m) => m.menu ?? []);
    expect(entries.filter((e) => !groups.has(e.group))).toEqual([]);
    const places = entries.map((e) => `${e.group}:${e.order}`);
    expect(new Set(places).size).toBe(places.length);
  });

  it("gives every page one address, and every manifest one key", () => {
    const paths = MANIFESTS.flatMap((m) => [...(m.routes ?? []), ...(m.openRoutes ?? [])].map((r) => r.path));
    expect(new Set(paths).size).toBe(paths.length);
    const keys = MANIFESTS.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("lets a bridge fill only the slots of its own modules, and a module none of the others' (docs/moduli-architettura.md, §7.4)", () => {
    const wrong = MANIFESTS.flatMap((m) => (m.fills ?? []).map((f) => ({ by: m.key, owner: f.slot.split(".")[0]! })))
      .filter(({ by, owner }) => !(MANIFESTS.find((m) => m.key === by)?.needs ?? [by]).includes(owner))
      .map(({ by, owner }) => `${by} → ${owner}`);
    expect(wrong).toEqual([]);
    expect(MANIFESTS.flatMap((m) => m.fills ?? []).length).toBeGreaterThan(0);
  });

  it("turns a bridge on only while both of its modules are on, and never turns the platform off", () => {
    const keysOn = (modules: Record<string, boolean>) => on(person("admin", ALL, modules)).map((m) => m.key);
    expect(keysOn({})).toEqual(["platform", "budget", "treasury", "inventory", "registry", "treasury-budget", "inventory-budget"]);
    expect(keysOn({ treasury: false })).toEqual(["platform", "budget", "inventory", "registry", "inventory-budget"]);
    expect(keysOn({ budget: false })).toEqual(["platform", "treasury", "inventory", "registry"]);
    expect(keysOn({ budget: false, treasury: false, inventory: false, registry: false })).toEqual(["platform"]);
  });
});
