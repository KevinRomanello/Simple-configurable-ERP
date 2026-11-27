import { describe, expect, it } from "vitest";
import { MANIFESTS } from "./manifests";
import { homeOf } from "./platform/home";
import { byOrder, manifestOn } from "./platform/manifest";
import { coreListsKeptInApp, settingsSections } from "./platform/settingsSections";
import type { Me, Permissions } from "./platform/types";

// The manifests of the site as they are (docs/moduli-architettura.md, §7.2): what each person sees in Settings, the groups of the
// menu, the pages, and which bridges are on.

const NONE: Permissions = {
  canEditShared: false, canManageCash: false, canChangeInflows: false, canManageSuppliers: false,
  canManageInventory: false, canViewHistory: false, canManageUsers: false, canManageSettings: false,
};
const ALL: Permissions = Object.fromEntries(Object.keys(NONE).map((key) => [key, true])) as unknown as Permissions;
/** A person on a site with these modules off; the bridges are on as the server says: while all their modules are. */
function person(role: Me["role"], permissions: Partial<Permissions>, modules: Record<string, boolean> = {}): Me {
  const bridges = Object.fromEntries(MANIFESTS.filter((m) => m.needs && m.needs.length > 0).map((m) => [m.key, m.needs!.every((key) => modules[key] !== false)]));
  return { role, permissions: { ...NONE, ...permissions }, modules, bridges } as Me;
}
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

describe("the first page of the site, from the manifests", () => {
  /** Where the first page leads: the budget's is a component that reads the areas (`FirstArea`), the others an address. */
  const homeFor = (me: Me) => {
    const page = homeOf(on(me), me) as { type: { name?: string }; props: { to?: string } };
    return page.props.to ?? page.type.name;
  };

  it("is the first area of the budget while the budget is on", () => {
    expect(homeFor(person("viewer", {}))).toBe("FirstArea");
  });

  it("is the first page of the next module that is on, in the order budget, inventory, treasury, registry", () => {
    expect(homeFor(person("admin", ALL, { budget: false }))).toBe("/inventory");
    expect(homeFor(person("admin", ALL, { budget: false, inventory: false }))).toBe("/register");
    expect(homeFor(person("admin", ALL, { budget: false, inventory: false, treasury: false }))).toBe("/registry");
  });

  it("skips the register for who cannot see it, and is Settings with every module off", () => {
    expect(homeFor(person("viewer", {}, { budget: false, inventory: false }))).toBe("/registry");
    expect(homeFor(person("admin", ALL, { budget: false, inventory: false, treasury: false, registry: false }))).toBe("/settings");
  });
});

describe("every combination of the four modules (docs/moduli-architettura.md, §12)", () => {
  const MODULES = ["budget", "treasury", "inventory", "registry"];
  const combinations = Array.from({ length: 2 ** MODULES.length }, (_, mask) => Object.fromEntries(MODULES.map((key, i) => [key, (mask & (1 << i)) === 0])));

  it("are 16, and in each the site shows only what is on: groups with entries, entries in groups that are there, a first page", () => {
    expect(combinations).toHaveLength(16);
    for (const modules of combinations) {
      const me = person("admin", ALL, modules);
      const shown = on(me);
      const keys = shown.map((m) => m.key);
      // a module that is off is not there, nor a bridge with one of its modules off
      for (const m of MANIFESTS) expect([m.key, keys.includes(m.key)]).toEqual([m.key, m.needs === undefined ? modules[m.key] : m.needs.every((k) => modules[k])]);
      const groups = shown.flatMap((m) => m.menuGroups ?? []).map((g) => g.id);
      const entries = shown.flatMap((m) => m.menu ?? []);
      expect(entries.filter((e) => !groups.includes(e.group))).toEqual([]);
      for (const group of groups) expect([group, entries.some((e) => e.group === group)]).toEqual([group, true]);
      expect(settingsSections(shown, me).map((s) => s.key)).toContain("app");
      expect(homeOf(shown, me)).toBeTruthy();
    }
  });

  it("keeps the lists of the core in Settings › App while the module that shows them is off, for who kept them there", () => {
    const keptFor = (me: Me) => coreListsKeptInApp(on(me), me);
    expect(keptFor(person("admin", ALL))).toEqual([]);
    expect(keptFor(person("admin", ALL, { budget: false }))).toEqual(["seasons", "vatRates"]);
    expect(keptFor(person("admin", ALL, { inventory: false }))).toEqual(["categories"]);
    expect(keptFor(person("admin", ALL, { budget: false, inventory: false }))).toEqual(["seasons", "vatRates", "categories"]);
    // a user who keeps the inventory keeps the categories, not the seasons or the VAT rates
    expect(keptFor(person("pm", { canManageInventory: true }, { budget: false, inventory: false }))).toEqual(["categories"]);
    expect(keptFor(person("viewer", {}, { budget: false, inventory: false }))).toEqual([]);
  });
});
