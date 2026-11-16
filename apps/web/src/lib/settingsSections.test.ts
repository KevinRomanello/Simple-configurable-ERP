import { describe, expect, it } from "vitest";
import { currentSection, settingsSections } from "./settingsSections";

const none = { canManageSettings: false, canManageInventory: false, canManageCash: false };

describe("settingsSections", () => {
  it("gives the admin every section, the budget first and the look of the site last", () => {
    expect(settingsSections({ canManageSettings: true, canManageInventory: true, canManageCash: true })).toEqual(["budget", "inventory", "register", "appearance"]);
  });

  it("gives a user the inventory, and the register only with the treasury box", () => {
    expect(settingsSections({ ...none, canManageInventory: true })).toEqual(["inventory", "appearance"]);
    expect(settingsSections({ ...none, canManageInventory: true, canManageCash: true })).toEqual(["inventory", "register", "appearance"]);
  });

  it("gives a viewer only how the site looks", () => {
    expect(settingsSections(none)).toEqual(["appearance"]);
  });
});

describe("currentSection", () => {
  const user = settingsSections({ ...none, canManageInventory: true });

  it("shows the section the address asks for when the person can use it", () => {
    expect(currentSection(user, "appearance")).toBe("appearance");
    expect(currentSection(user, "inventory")).toBe("inventory");
  });

  it("falls back to the first section of the person: no section asked, one that does not exist, or one that is not theirs", () => {
    expect(currentSection(user, undefined)).toBe("inventory");
    expect(currentSection(user, "nowhere")).toBe("inventory");
    expect(currentSection(user, "budget")).toBe("inventory");
    expect(currentSection(["appearance"], "register")).toBe("appearance");
  });
});
