import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

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
    imports: [...readFileSync(path, "utf8").matchAll(/^\s*(?:import|export)\b[^;]*?from\s+"([^"]+)"/gms)].map((m) => m[1]!),
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

  it("the registry knows no other module but who is signing in (auth)", () => {
    const registry = sources("apps/api/src/modules/registry");
    expect(offending(registry, (target) => /^\.\.\/(?!auth\/)[a-z-]+\//.test(target))).toEqual([]);
    // nor their tables: of the shared ones, only the people (app_user), the history and its own secrets
    const tables = registry.flatMap((f) => (readFileSync(join(root, f.file), "utf8").match(/import \{([^}]*)\} from "\.\.\/\.\.\/db\/schema"/)?.[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean));
    expect(tables.filter((t) => !/^reg[A-Z]/.test(t) && !["appUser", "appSecret", "auditLog"].includes(t))).toEqual([]);
  });

  it("other modules reach the registry only through registry.public", () => {
    const modules = sources("apps/api/src/modules").filter((f) => !f.file.includes("/modules/registry/"));
    expect(offending(modules, (target) => target.startsWith("../registry/") && target !== "../registry/registry.public")).toEqual([]);
  });

  it("nobody depends on rolesync: it is a bridge, plugged in by app.ts alone", () => {
    const all = sources("apps/api/src").filter((f) => !f.file.includes("/modules/rolesync/") && !f.file.endsWith("src/app.ts"));
    expect(offending(all, (target) => target.includes("rolesync"))).toEqual([]);
  });

  it("budget, cash, inventory and the rest know nothing of the registry", () => {
    const others = sources("apps/api/src/modules").filter((f) => !/\/modules\/(registry|rolesync)\//.test(f.file));
    expect(offending(others, (target) => target.includes("registry") || target === "@erp/registry")).toEqual([]);
  });

  it("the switch of the modules knows no module, only their addresses (it needs just who is signing in: auth)", () => {
    expect(offending(sources("apps/api/src/modules/appmodules"), (target) => /^\.\.\/(?!auth\/)[a-z-]+\//.test(target))).toEqual([]);
  });

  it("only app.ts, the sign-in (who knows what is on) and the bridge to the registry use the switch of the modules", () => {
    const others = sources("apps/api/src").filter((f) => !f.file.includes("/modules/appmodules/") && !f.file.endsWith("src/app.ts"));
    const allowed = ["apps/api/src/modules/auth/auth.routes.ts", "apps/api/src/modules/rolesync/rolesync.service.ts"];
    expect(offending(others, (target, file) => target.includes("appmodules") && !allowed.includes(file))).toEqual([]);
  });
});
