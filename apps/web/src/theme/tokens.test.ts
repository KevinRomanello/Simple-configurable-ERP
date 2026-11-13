import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// tokens.css has the dark colours twice: for a system that is dark (a media query) and for a person who chose dark (an attribute).
// CSS cannot share a rule between the two, so this says they never differ. docs/stile-interfaccia.md
const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

/** The declarations of the first rule with this selector, as "name: value" lines. */
function declarations(selector: string): string[] {
  const start = css.indexOf(selector);
  expect(start, `the rule ${selector}`).toBeGreaterThan(-1);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  return body.replace(/\/\*[\s\S]*?\*\//g, "").split(";").map((d) => d.trim().replace(/\s+/g, " ")).filter(Boolean);
}

describe("the dark tokens", () => {
  const forSystem = declarations(':root:not([data-theme="light"]):not([data-theme="dark"])');
  const chosen = declarations(':root[data-theme="dark"]');

  it("are the same whether the system is dark or the person chose dark", () => {
    expect(chosen).toEqual(forSystem);
    expect(chosen.length).toBeGreaterThan(40);
  });

  it("start by switching the browser to its dark parts (scrollbars, form controls)", () => {
    expect(chosen[0]).toBe("color-scheme: dark");
  });

  it("have a value for every colour of the light theme, except the yellow of the brand and the text on it, which are the same in both", () => {
    const colours = (list: string[]) => list.filter((d) => d.startsWith("--") && /#/.test(d)).map((d) => d.split(":")[0]!);
    const missing = colours(declarations(":root")).filter((name) => !colours(chosen).includes(name));
    // a new colour that is only in the light block makes this fail: say here that it is the same in both, or give it a dark value
    expect(missing.sort()).toEqual(["--on-primary", "--on-primary-negative", "--on-primary-positive", "--primary-default"]);
  });
});
