import { describe, expect, it } from "vitest";
import { currentSection, settingsSections } from "./settingsSections";

const none = { canManageSettings: false, canManageInventory: false, canManageCash: false };

describe("settingsSections", () => {
  it("gives the admin every section, the budget first and the look of the site last", () => {
    expect(settingsSections({ canManageSettings: true, canManageInventory: true, canManageCash: true })).toEqual(["budget", "inventory", "register", "registry", "app"]);
  });

  it("leaves the Registry section out while that module is off, for the admin too", () => {
    const admin = { canManageSettings: true, canManageInventory: true, canManageCash: true };
    expect(settingsSections(admin, { registry: false })).toEqual(["budget", "inventory", "register", "app"]);
    expect(settingsSections(admin, { registry: true })).toContain("registry");
    expect(settingsSections(admin, {})).toContain("registry"); // a module nothing turned off is on
  });

  it("gives a user the inventory, and the register only with the treasury box", () => {
    expect(settingsSections({ ...none, canManageInventory: true })).toEqual(["inventory", "app"]);
    expect(settingsSections({ ...none, canManageInventory: true, canManageCash: true })).toEqual(["inventory", "register", "app"]);
  });

  it("gives a viewer only the App section (how the site looks)", () => {
    expect(settingsSections(none)).toEqual(["app"]);
  });
});

describe("currentSection", () => {
  const user = settingsSections({ ...none, canManageInventory: true });

  it("shows the section the address asks for when the person can use it", () => {
    expect(currentSection(user, "app")).toBe("app");
    expect(currentSection(user, "inventory")).toBe("inventory");
  });

  it("still leads the old address of the App section, Appearance, to it", () => {
    expect(currentSection(user, "appearance")).toBe("app");
  });

  it("sends the address of a section that is not there (the Registry one, while it is off) to the first of the person", () => {
    const admin = settingsSections({ canManageSettings: true, canManageInventory: true, canManageCash: true }, { registry: false });
    expect(currentSection(admin, "registry")).toBe("budget");
  });

  it("falls back to the first section of the person: no section asked, one that does not exist, or one that is not theirs", () => {
    expect(currentSection(user, undefined)).toBe("inventory");
    expect(currentSection(user, "nowhere")).toBe("inventory");
    expect(currentSection(user, "budget")).toBe("inventory");
    expect(currentSection(["app"], "register")).toBe("app");
  });
});
