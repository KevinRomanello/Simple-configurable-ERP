import { describe, expect, it } from "vitest";
import { testConfig } from "../test/helpers";
import { buildApp } from "./app";
import { listBridges, listModuleDefs } from "./platform/appmodules/appmodules.service";

// The gate of the switches turns a module off by the first piece of the address, /api/<key>/… (docs/moduli-architettura.md, §8.2 and §12,
// rule 7): a route of a module outside its key would answer even with the module off. app.ts gives each module and bridge its key as the
// prefix of all its routes; this test reads the routes the server really has, so a route registered any other way is caught.

/** The first pieces of the addresses of the core, which is never off: a new one is a choice, written here. */
const CORE = ["areas", "audit", "auth", "flags", "health", "lookups", "me", "modules", "seasons", "settings", "tokens", "users"];

describe("the addresses of the server", () => {
  it("are under the key of a module or a bridge, or are among the core's; and no address of the core has the name of a module", async () => {
    const app = buildApp({ config: testConfig, google: null, rateLimits: false });
    const urls: string[] = [];
    app.addHook("onRoute", (route) => {
      urls.push(route.url);
    });
    await app.ready();
    await app.close();

    const owners = new Set([...listModuleDefs().map((m) => m.key), ...listBridges().map((b) => b.key)]);
    const firsts = new Set(urls.map((url) => url.split("/")[2] ?? ""));
    expect([...firsts].filter((first) => !owners.has(first)).sort()).toEqual(CORE);
    expect(CORE.filter((first) => owners.has(first))).toEqual([]);
    // every module and bridge answers somewhere: a key with no route would mean its routes went under another name
    expect([...owners].filter((key) => !firsts.has(key))).toEqual([]);
  });
});
