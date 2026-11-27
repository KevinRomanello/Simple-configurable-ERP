import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BRIDGES, FOLDER_OWNERS, IMPORT_EXCEPTIONS, SCHEMA_FILES, SNAPSHOT_OWNER, type Owner } from "./architecture.map";

// The boundaries of the modules, checked on the code (docs/anagrafiche.md, §2; CLAUDE.md): a module may change
// inside without touching the others, because they reach it only through what it chooses to show.

const root = fileURLToPath(new URL("../../../", import.meta.url));

/** The source files (tests left out) under a folder, with the modules they import. */
function sources(folder: string): { file: string; imports: string[] }[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return walk(path);
      return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });
  return walk(join(root, folder)).map((path) => ({
    file: relative(root, path),
    // `import … from "x"`, `export … from "x"` and the bare `import "x"` (which loads a file for what it does when it is read)
    imports: [...readFileSync(path, "utf8").matchAll(/^\s*(?:(?:import|export)\b[^;]*?from\s+|import\s+)"([^"]+)"/gms)].map((m) => m[1]!),
  }));
}

const offending = (files: { file: string; imports: string[] }[], bad: (target: string, file: string) => boolean) =>
  files.flatMap((f) => f.imports.filter((target) => bad(target, f.file)).map((target) => `${f.file} → ${target}`));

describe("the boundaries of the modules", () => {
  it("the engines are pure: they import only their own files", () => {
    for (const engine of ["packages/registry/src", "packages/calc/src"]) {
      expect(offending(sources(engine), (target) => !target.startsWith("./"))).toEqual([]);
    }
  });

  it("only the registry, and the bridge that gives roles from it, use the engine of the registry", () => {
    const others = [...sources("apps/api/src/modules"), ...sources("apps/api/src/platform"), ...sources("apps/api/src/bridges")].filter((f) => !/\/(modules\/registry|bridges\/registry-access)\//.test(f.file));
    expect(offending(others, (target) => target.includes("registry") || target === "@erp/registry")).toEqual([]);
  });

  it("only app.ts, the sign-in (who knows what is on) and the bridge to the registry use the switch of the modules", () => {
    const others = sources("apps/api/src").filter((f) => !f.file.includes("/platform/appmodules/") && !f.file.endsWith("src/app.ts"));
    const allowed = ["apps/api/src/platform/auth/auth.routes.ts", "apps/api/src/bridges/registry-access/rolesync.service.ts"];
    expect(offending(others, (target, file) => target.includes("appmodules") && !allowed.includes(file))).toEqual([]);
  });
});

// --- the owners of the code and of the tables (docs/moduli-architettura.md, §11 G0 and §12) ----------------------------------
//
// Every file of the server belongs to an owner (`architecture.map.ts`): the core, a module that can be turned off, or a bridge between
// two modules. The rules are the ones the design asks for; where today's code does not obey them yet, the exceptions list says where, and
// it can only shrink.

const srcRoot = join(root, "apps/api/src");
/** `barrel` is `db/schema.ts`, which has every table: only the database client, the tools and the wiring use it. */
type Who = Owner | "core" | "db" | "app" | "barrel";

/** A file or an import target as a path from `apps/api/src`, without the extension. */
const slash = (path: string) => path.split("\\").join("/").replace(/\.tsx?$/, "");
const folderOf = (rel: string) => rel.match(/^modules\/([^/]+)(?:\/|$)/)?.[1];

function whoOwns(rel: string): Who {
  if (rel === "snapshot") return SNAPSHOT_OWNER;
  if (rel.startsWith("platform/")) return "platform";
  // a bridge's folder is named after it (`bridges/registry-access`)
  const bridge = rel.match(/^bridges\/([\w-]+)(?:\/|$)/)?.[1];
  if (bridge) return bridge as Owner;
  const folder = folderOf(rel);
  if (folder) return FOLDER_OWNERS[folder] ?? "app";
  if (rel.startsWith("core/")) return "core";
  // the tables of an owner are in its schema file (`db/schema/budget.ts`): reaching a table is importing that file
  if (rel === "db/schema") return "barrel";
  const schemaFile = rel.match(/^db\/schema\/([\w-]+)$/)?.[1];
  if (schemaFile && schemaFile !== "columns") return schemaFile as Owner;
  if (rel.startsWith("db/")) return "db";
  return "app"; // app.ts, main.ts, the data of these tests: the wiring may use anything
}

/**
 * Whether a file of `from` may import a file of `to`. The wiring (`app.ts`) and the tools of the database (the seeds) may use anything,
 * and anybody may use the infrastructure and the core of the ERP. The core knows no module. A module knows nothing of another module,
 * and a bridge reaches only the `*.public` file of its own modules (and, in its schema file only, their schema files, for its tables to point at
 * theirs). A table is reached by importing the schema file of its owner, so the same rule keeps an owner to its own tables.
 */
function mayImport(from: Who, to: Who, target: string, file: string): boolean {
  if (from === "app" || from === "db" || from === "barrel" || from === to) return true;
  if (to === "barrel") return false;
  if (to === "core" || to === "db" || to === "platform") return true;
  if (from === "core" || from === "platform") return false;
  const modules = BRIDGES[from];
  // a bridge also has its tables point at the tables of its modules, but its services never reach them: they ask the module
  return modules !== undefined && modules.includes(to as Owner) && (target.endsWith(".public") || (target.startsWith("db/schema/") && file.startsWith("db/schema/")));
}

const allFiles = sources("apps/api/src").map((f) => ({ ...f, rel: slash(relative(srcRoot, join(root, f.file))) }));
const withOwner = allFiles.map((f) => ({ ...f, who: whoOwns(f.rel), text: readFileSync(join(root, f.file), "utf8") }));

describe("who owns what, and who may use it", () => {
  it("has an owner for every folder of the modules and a schema file for every owner that has tables, and nothing that is not there any more", () => {
    const folders = readdirSync(join(srcRoot, "modules")).filter((n) => statSync(join(srcRoot, "modules", n)).isDirectory());
    expect(folders.sort()).toEqual(Object.keys(FOLDER_OWNERS).sort());
    // the folders of the bridges are named after bridges that exist
    const bridges = readdirSync(join(srcRoot, "bridges")).filter((n) => statSync(join(srcRoot, "bridges", n)).isDirectory());
    expect(bridges.filter((n) => !(n in BRIDGES))).toEqual([]);
    // each schema file is an owner's, every table is in exactly one of them (a table cannot be defined twice: drizzle would not know which), and the barrel has them all
    const files = readdirSync(join(srcRoot, "db/schema")).map((n) => n.replace(/\.ts$/, "")).filter((n) => n !== "columns");
    expect(files.sort()).toEqual([...SCHEMA_FILES].sort());
    const barrel = readFileSync(join(srcRoot, "db/schema.ts"), "utf8");
    expect([...barrel.matchAll(/export \* from "\.\/schema\/([\w-]+)"/g)].map((m) => m[1]!).filter((n) => n !== "columns").sort()).toEqual([...SCHEMA_FILES].sort());
    const tables = files.flatMap((n) => [...readFileSync(join(srcRoot, `db/schema/${n}.ts`), "utf8").matchAll(/^export const (\w+) = pgTable\(/gm)].map((m) => m[1]!));
    expect(new Set(tables).size).toBe(tables.length);
  });

  it("keeps the code and the tables of an owner to its own, to the core and the engines: a bridge reaches only the public file of its modules", () => {
    const found = withOwner.flatMap((f) =>
      f.imports
        .filter((spec) => spec.startsWith("."))
        .map((spec) => slash(relative(srcRoot, resolve(dirname(join(root, f.file)), spec))))
        .filter((target) => !mayImport(f.who, whoOwns(target), target, f.rel))
        .map((target) => `${f.rel} → ${target}`),
    );
    expect({ new: found.filter((v) => !IMPORT_EXCEPTIONS.includes(v)).sort() }).toEqual({ new: [] });
    expect({ gone: IMPORT_EXCEPTIONS.filter((v) => !found.includes(v)).sort() }).toEqual({ gone: [] });
  });

  it("lets nobody import a bridge but app.ts, which plugs it in", () => {
    const bridges = new Set(Object.keys(BRIDGES));
    const found = withOwner.flatMap((f) =>
      f.imports
        .filter((spec) => spec.startsWith("."))
        .map((spec) => slash(relative(srcRoot, resolve(dirname(join(root, f.file)), spec))))
        .filter((target) => bridges.has(whoOwns(target)) && whoOwns(target) !== f.who && !["app", "db", "barrel"].includes(f.who))
        .map((target) => `${f.rel} → ${target}`),
    );
    expect(found.filter((v) => !IMPORT_EXCEPTIONS.includes(v))).toEqual([]);
  });

  it("shows nothing of the database in a public file, and every change of what it shows is wanted (the names are written here)", () => {
    const publics = withOwner.filter((f) => f.rel.endsWith(".public"));
    // no table, no row, no query of Drizzle goes out of a module
    expect(publics.filter((f) => /\$infer|export\s[^;]*from\s*"[^"]*\/db\/schema"/s.test(f.text)).map((f) => f.rel)).toEqual([]);
    const names = (text: string) => [
      ...[...text.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|class|interface|type|enum)\s+(\w+)/gm)].map((m) => m[1]!),
      ...[...text.matchAll(/^export\s*(?:type\s*)?\{([^}]*)\}/gm)].flatMap((m) => m[1]!.split(",").map((n) => n.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()!).filter(Boolean)),
    ];
    const shown = Object.fromEntries(publics.map((f) => [f.rel, names(f.text).sort()]));
    expect(shown).toEqual(PUBLIC_NAMES);
  });
});

/** What each public file shows to the others. A name added or taken away fails the test above, so that it is a choice. */
const PUBLIC_NAMES: Record<string, string[]> = {
  "modules/budget/budget.public": [
    "InflowFact", "InflowReceipt", "RegisterIncome", "assertCanChangeInflows", "bankOf", "computedLines", "deleteInflowsIn", "inflowDeleting", "inflowReceipts", "inflowsByIds", "inflowsOfSeason", "lineLabels", "linePayments", "outsideBudgetOf", "registerBank", "registerSponsorship", "seasonsOfLines",
  ],
  "modules/treasury/treasury.public": [
    "CreateEntryInput", "DayRange", "EntryFact", "EntryLink", "OutsideFact", "assertCanManageCash", "assertListed", "deleteEntryIn", "entriesByIds", "entryChanging", "entryLinks", "insertEntry", "lastPaymentMethodId", "moneyInBetween", "outsideBetween", "paymentsBetween", "registerBalanceAt", "sponsorshipMoneyBetween",
  ],
  "platform/platform.public": [
    "AuditRow", "PermissionRule", "UsageKind", "UsageRow", "UsageSubject", "UserFlag", "auditLabels", "auditText", "can", "categoryCreated", "currentActive", "declaredFlags", "lookupRenamed", "permissionRules", "seasonCreated", "totalUse", "usageOf", "usedBy", "userFlags",
  ],
  "modules/registry/registry.public": ["PersonInRegistry", "RegistryListener", "RegistryUseCheck", "groupsOfRegistry", "onRegistryChange", "onRegistryUse", "peopleInViews"],
};
