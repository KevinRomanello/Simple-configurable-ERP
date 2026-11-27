import { describe, expect, it } from "vitest";

// The site uses only the types of the registry's engine (docs/anagrafiche.md, §2): the values are worked out by
// the server, never again in the browser. And every table is the same one, so that all of them behave alike
// (resizable columns, docs/stile-interfaccia.md). Checked on the code of every page.

const files = import.meta.glob(["./**/*.ts", "./**/*.tsx", "!./**/*.test.ts", "!./**/*.test.tsx"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;

describe("the site and the engine of the registry", () => {
  it("imports only types from @erp/registry", () => {
    const runtime = Object.entries(files).filter(([, text]) => /^\s*import\s+(?!type\b)[^;]*from\s+"@erp\/registry"/m.test(text)).map(([path]) => path);
    expect(Object.keys(files).length).toBeGreaterThan(50);
    expect(runtime).toEqual([]);
  });

  it("draws every table with the Table of core/ui, so that all of them behave alike", () => {
    // the one table that is not a table of data: the little list inside the tooltip of a chart
    const allowed = ["./core/ui/Table.tsx", "./core/LineChart.tsx"];
    const own = Object.entries(files).filter(([path, text]) => !allowed.includes(path) && /<table[\s>]/.test(text)).map(([path]) => path);
    expect(own).toEqual([]);
  });

  it("draws every picture with Picture of core, so that a click on any of them opens the big one", () => {
    // the tiles of the map are not pictures to look at: they are the background of the map, drawn many at a time
    const own = Object.entries(files).filter(([path, text]) => path !== "./core/Picture.tsx" && /<img(?![^>]*\bmap-tile\b)/.test(text)).map(([path]) => path);
    expect(own).toEqual([]);
  });

  it("opens the form of an action on a row with RowAction, never in a row of its own or in a bare popup", () => {
    // the old ways: a table row of the class row-panel (or a FragmentRow that made one) with the form in it, and a Peek (the big
    // rectangle of the record of the registry) used as the popup of an action
    const under = Object.entries(files).filter(([, text]) => /\brow-panel\b|\bFragmentRow\b/.test(text)).map(([path]) => path);
    expect(under).toEqual([]);
    const allowed = ["./core/ui/Peek.tsx", "./core/ui/index.ts", "./modules/registry/RecordPanel.tsx"];
    const bare = Object.entries(files).filter(([path, text]) => !allowed.includes(path) && /<Peek\b/.test(text)).map(([path]) => path);
    expect(bare).toEqual([]);
  });

  it("keeps what is written in every form (useDraft), so that leaving a page loses nothing", () => {
    // not forms to keep: the frame of the forms, the choice of a file (a file is not kept), and the public form (nobody is logged in)
    const never = ["./core/ui/FormPanel.tsx", "./modules/inventory/Datasheets.tsx", "./modules/registry/FormPage.tsx"];
    // a form is a FormPanel, a bare form, or the editor of an item (the one form not built from the first two)
    const hasForm = (text: string) => /<FormPanel\b|<form\b|<ItemEditor\b/.test(text);
    // the call, not the import (the file of useDraft also holds useRemembered, which keeps only what is open)
    const keeps = (text: string) => /\buseDraft\s*[<(]/.test(text);
    const forms = Object.entries(files).filter(([, text]) => hasForm(text));
    expect(forms.length).toBeGreaterThan(10);
    const loses = forms.filter(([path, text]) => !keeps(text) && !never.includes(path)).map(([path]) => path);
    expect(loses).toEqual([]);
    // an excepted file must still exist and still have a form (a list of exceptions that only grows stale is no list)
    const stale = never.filter((path) => !files[path] || !hasForm(files[path]!));
    expect(stale).toEqual([]);
  });

  it("moves rows with the handle, never with arrows: the order of a list is its drag handle (DataTable reorder, useDragOrder)", () => {
    // the arrows of sorting and of «open in a new tab» have other names (faSort…, faArrowUpRightFromSquare)
    const arrows = Object.entries(files).filter(([, text]) => /\bfaArrow(Up|Down)\b|"Move (up|down)"/.test(text)).map(([path]) => path);
    expect(arrows).toEqual([]);
  });
});

// --- who owns what in the site, and who may use it (docs/moduli-architettura.md, §7.3) -----------------------------------------
//
// The same rules as the server's (apps/api/src/architecture.test.ts): every file belongs to an owner, by its folder. `core/` is the
// frame every page is drawn with (it knows no module), `platform/` the core of the ERP (sign-in, users, Settings, History, seasons), a
// module is a folder of `modules/`, a bridge one of `bridges/`. A module uses its own files, the core, the platform and the `public.ts`
// of another module; a bridge, the `public.ts` of its two modules; nobody imports a bridge but the wiring (manifests.ts). What a
// module lends is the list of names of its public.ts, written below: changing it is a choice. The slots of a module are defined in
// its slots.ts (§7.4).

/** The modules each bridge joins: a bridge is on only when both are on. */
const SITE_BRIDGES: Record<string, string[]> = {
  "treasury-budget": ["treasury", "budget"],
  "inventory-budget": ["inventory", "budget"],
  "registry-access": ["registry"],
};

/**
 * Where the site still reaches into another owner's files, as `file → what it imports` (paths from src, without the extension).
 * Empty since G7, tappa 4: a new line here is a choice to discuss, not a way to make the test pass.
 */
const SITE_EXCEPTIONS: string[] = [];

/** What each module lends to the others: the names its public.ts exports (G7, tappa 4). */
const SITE_PUBLIC: Record<string, string[]> = {
  "modules/budget/public": ["ArrivalPill", "Inflow", "inflowActions"],
  "modules/inventory/public": ["ProjectRef", "PurchaseToReceive", "ReceiveForm", "inventoryItems", "purposeProjects", "useInventoryLookups", "usePrice"],
  "modules/treasury/public": ["CashAccount", "CashEntryRow", "registerLists", "registerRowActions", "registerSettings"],
};

/** The names a file exports: its own declarations and what it passes on from others. */
function exportedNames(text: string): string[] {
  const declared = [...text.matchAll(/^export\s+(?:const|function|class|interface|type)\s+(\w+)/gm)].map((m) => m[1]!);
  const passed = [...text.matchAll(/^export\s+(?:type\s+)?\{([^}]*)\}/gm)].flatMap((m) =>
    m[1]!.split(",").map((name) => name.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()!).filter(Boolean),
  );
  return [...declared, ...passed].sort();
}

const sitePath = (path: string) => path.replace(/^\.\//, "").replace(/\.tsx?$/, "");

function siteOwner(rel: string): string {
  const m = rel.match(/^(modules|bridges)\/([\w-]+)(\/|$)/); // `modules/budget` alone is its index.tsx, the manifest
  if (m) return m[2]!;
  if (rel.startsWith("core/") || rel.startsWith("theme/")) return "core";
  if (rel.startsWith("platform/")) return "platform";
  return "app"; // App.tsx, main.tsx and the list of manifests: the wiring may use anything (this test is not among the files it reads)
}

function siteMayImport(from: string, to: string, target: string): boolean {
  if (from === "app" || from === to) return true;
  if (to === "core") return true;
  if (from === "core") return false;
  if (to === "platform") return true;
  if (from === "platform") return false;
  if (SITE_BRIDGES[to]) return false; // a bridge is plugged in by the wiring only (manifests.ts)
  const isPublic = target.endsWith("/public");
  if (SITE_BRIDGES[from]) return SITE_BRIDGES[from]!.includes(to) && isPublic;
  return isPublic; // a module reaches another module only through its public.ts
}

// every file of the site, its tests included (a test belongs to the owner of its folder and obeys the same rules)
const everyFile = import.meta.glob(["./**/*.ts", "./**/*.tsx"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;

const siteSources = Object.entries(everyFile).map(([path, text]) => ({
  rel: sitePath(path),
  imports: [...text.matchAll(/^\s*(?:(?:import|export)\b[^;]*?from\s+|import\s+)"(\.[^"]+)"/gms)].map((m) => m[1]!),
}));

const resolveSite = (from: string, spec: string) => {
  const parts = from.split("/").slice(0, -1);
  for (const piece of spec.split("/")) {
    if (piece === "..") parts.pop();
    else if (piece !== ".") parts.push(piece);
  }
  return parts.join("/").replace(/\.(tsx?|css)$/, "");
};

describe("who owns what in the site, and who may use it", () => {
  it("has a folder for every module and bridge of the server, and nothing outside core, platform, modules and bridges but the wiring", () => {
    const owners = new Set(siteSources.map((s) => siteOwner(s.rel)));
    for (const owner of owners) expect(["app", "core", "platform", "budget", "treasury", "inventory", "registry", ...Object.keys(SITE_BRIDGES)]).toContain(owner);
    const wiring = siteSources.filter((s) => siteOwner(s.rel) === "app").map((s) => s.rel).sort();
    expect(wiring).toEqual(["App", "main", "manifests", "manifests.test"]);
  });

  it("keeps each owner to its own files, the core, the platform and the public files of the others; only the wiring imports a bridge", () => {
    const found = siteSources.flatMap((s) =>
      s.imports
        .map((spec) => resolveSite(s.rel, spec))
        .filter((target) => !siteMayImport(siteOwner(s.rel), siteOwner(target), target))
        .map((target) => `${s.rel} → ${target}`),
    );
    expect({ new: found.filter((v) => !SITE_EXCEPTIONS.includes(v)).sort() }).toEqual({ new: [] });
    expect({ gone: SITE_EXCEPTIONS.filter((v) => !found.includes(v)).sort() }).toEqual({ gone: [] });
  });

  it("lends to the others only the names written here: the public.ts of each module", () => {
    const lent = Object.fromEntries(
      Object.entries(everyFile)
        .filter(([path]) => /^\.\/modules\/[\w-]+\/public\.ts$/.test(path))
        .map(([path, text]) => [sitePath(path), exportedNames(text)]),
    );
    expect(lent).toEqual(SITE_PUBLIC);
  });

  it("defines the slots of a module in its slots.ts, and only there", () => {
    const elsewhere = Object.entries(everyFile)
      .filter(([path, text]) => /\bdefineSlot\s*</.test(text) && !/^\.\/modules\/[\w-]+\/slots\.ts$/.test(path) && path !== "./core/slots.tsx")
      .map(([path]) => sitePath(path));
    expect(elsewhere).toEqual([]);
  });
});
