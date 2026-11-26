import { describe, expect, it } from "vitest";
import { effectiveMode, popoverPlace, rowActionMode, ROW_ACTION_KEY, saveRowActionMode } from "./rowAction";

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

describe("the mode of the actions on a row", () => {
  it("is under the row until someone chooses, and then what they chose", () => {
    const s = store();
    expect(rowActionMode(s)).toBe("under");
    saveRowActionMode("side", s);
    expect(s.data.get(ROW_ACTION_KEY)).toBe("side");
    expect(rowActionMode(s)).toBe("side");
    saveRowActionMode("under", s); // the mode without a choice is forgotten
    expect(s.data.has(ROW_ACTION_KEY)).toBe(false);
  });

  it("ignores a value that is not a mode, and works without the storage of the browser", () => {
    const s = store();
    s.data.set(ROW_ACTION_KEY, "fullscreen");
    expect(rowActionMode(s)).toBe("under");
    expect(rowActionMode(store(true))).toBe("under");
    expect(() => saveRowActionMode("dialog", store(true))).not.toThrow();
  });
});

describe("what an action really opens as", () => {
  const ok = { anchored: true, quick: true, phone: false };

  it("is the mode asked for when it can be", () => {
    for (const mode of ["under", "dialog", "side", "popover"] as const) expect(effectiveMode(mode, ok)).toBe(mode);
  });

  it("is a dialog for an action that belongs to no row, when it was asked under the row", () => {
    expect(effectiveMode("under", { ...ok, anchored: false })).toBe("dialog");
    expect(effectiveMode("side", { ...ok, anchored: false })).toBe("side");
  });

  it("is a dialog for a popover when the action has no quick form, or on a phone", () => {
    expect(effectiveMode("popover", { ...ok, quick: false })).toBe("dialog");
    expect(effectiveMode("popover", { ...ok, phone: true })).toBe("dialog");
  });
});

describe("where the popover goes", () => {
  const screen = { width: 1000, height: 700 };
  const size = { width: 340, height: 200 };

  it("is below the button, with its right edge on the button's", () => {
    const place = popoverPlace({ left: 800, right: 900, top: 100, bottom: 130 }, size, screen);
    expect(place).toMatchObject({ left: 560, top: 138, above: false });
    // the pointer is under the middle of the button
    expect(place.left + place.arrow + 5).toBe(850);
  });

  it("stays inside the screen at the left and at the right", () => {
    expect(popoverPlace({ left: 10, right: 60, top: 100, bottom: 130 }, size, screen).left).toBe(8);
    expect(popoverPlace({ left: 980, right: 1100, top: 100, bottom: 130 }, size, screen).left).toBe(1000 - 340 - 8);
  });

  it("goes above the button when there is no room below", () => {
    const place = popoverPlace({ left: 800, right: 900, top: 600, bottom: 630 }, size, screen);
    expect(place).toMatchObject({ top: 600 - 8 - 200, above: true });
  });

  it("is kept on the screen when there is no room above or below", () => {
    const place = popoverPlace({ left: 800, right: 900, top: 100, bottom: 130 }, { width: 340, height: 650 }, screen);
    expect(place.top).toBeGreaterThanOrEqual(8);
    expect(place.top + 650).toBeLessThanOrEqual(700);
  });
});
