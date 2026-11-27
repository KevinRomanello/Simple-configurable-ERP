import { describe, expect, it } from "vitest";
import { moduleOn } from "./modules";

describe("moduleOn", () => {
  it("is false only for a module the server says is off", () => {
    expect(moduleOn({ modules: { registry: false } }, "registry")).toBe(false);
    expect(moduleOn({ modules: { registry: true } }, "registry")).toBe(true);
    expect(moduleOn({ modules: {} }, "registry")).toBe(true); // not listed: nothing turned it off
  });
});
