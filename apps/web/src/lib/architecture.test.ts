import { describe, expect, it } from "vitest";

// The site uses only the types of the registry's engine (docs/anagrafiche.md, §2): the values are worked out by
// the server, never again in the browser. Checked on the code of every page.

const files = import.meta.glob(["../**/*.ts", "../**/*.tsx", "!../**/*.test.ts", "!../**/*.test.tsx"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;

describe("the site and the engine of the registry", () => {
  it("imports only types from @erp/registry", () => {
    const runtime = Object.entries(files).filter(([, text]) => /^\s*import\s+(?!type\b)[^;]*from\s+"@erp\/registry"/m.test(text)).map(([path]) => path);
    expect(Object.keys(files).length).toBeGreaterThan(50);
    expect(runtime).toEqual([]);
  });
});
