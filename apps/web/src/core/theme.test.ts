import { describe, expect, it } from "vitest";
import { applyTheme, readTheme, saveTheme, THEME_KEY } from "./theme";

/** A browser storage in memory; `blocked` throws like a private window does. */
function store(blocked = false) {
  const data = new Map<string, string>();
  const fail = () => {
    if (blocked) throw new Error("storage is blocked");
  };
  return {
    data,
    getItem: (k: string) => (fail(), data.get(k) ?? null),
    setItem: (k: string, v: string) => (fail(), void data.set(k, v)),
    removeItem: (k: string) => (fail(), void data.delete(k)),
  };
}

/** The page's root element, as far as the theme touches it. */
function root() {
  const attributes = new Map<string, string>();
  return { attributes, setAttribute: (k: string, v: string) => void attributes.set(k, v), removeAttribute: (k: string) => void attributes.delete(k) };
}

describe("the choice of the theme", () => {
  it("is the system's until someone chooses, and then what they chose", () => {
    const s = store();
    expect(readTheme(s)).toBe("system");
    saveTheme("dark", s);
    expect(s.data.get(THEME_KEY)).toBe("dark");
    expect(readTheme(s)).toBe("dark");
    saveTheme("light", s);
    expect(readTheme(s)).toBe("light");
  });

  it("forgets the choice when it goes back to the system's, and ignores what is not a theme", () => {
    const s = store();
    saveTheme("dark", s);
    saveTheme("system", s);
    expect(s.data.has(THEME_KEY)).toBe(false);
    s.data.set(THEME_KEY, "purple");
    expect(readTheme(s)).toBe("system");
  });

  it("works without the browser's storage: the system's theme, and no error", () => {
    const s = store(true);
    expect(readTheme(s)).toBe("system");
    expect(() => saveTheme("dark", s)).not.toThrow();
  });

  it("puts the theme on the page as data-theme, and takes it off for the system's", () => {
    const page = root();
    applyTheme("dark", page);
    expect(page.attributes.get("data-theme")).toBe("dark");
    applyTheme("light", page);
    expect(page.attributes.get("data-theme")).toBe("light");
    applyTheme("system", page);
    expect(page.attributes.has("data-theme")).toBe(false);
  });
});
