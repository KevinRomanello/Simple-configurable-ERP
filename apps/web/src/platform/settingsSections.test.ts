import { describe, expect, it } from "vitest";
import type { Manifest, SettingsSection } from "./manifest";
import { currentSection, settingsSections } from "./settingsSections";
import type { Me } from "./types";

const Content = () => null;
const section = (key: string, order: number, allowed: SettingsSection["allowed"] = () => true): SettingsSection => ({ key, label: key, order, allowed, Content });
const admin = { role: "admin" } as Me;

describe("settingsSections", () => {
  it("takes the sections of every manifest, in the order they say, whatever the order of the manifests", () => {
    const manifests: Manifest[] = [
      { key: "platform", settings: [section("app", 100)] },
      { key: "inventory", settings: [section("inventory", 20)] },
      { key: "budget", settings: [section("budget", 10)] },
    ];
    expect(settingsSections(manifests, admin).map((s) => s.key)).toEqual(["budget", "inventory", "app"]);
  });

  it("leaves out the sections the person may not use", () => {
    const manifests: Manifest[] = [{ key: "budget", settings: [section("budget", 10, (me) => me.role === "admin"), section("app", 100)] }];
    expect(settingsSections(manifests, { role: "viewer" } as Me).map((s) => s.key)).toEqual(["app"]);
    expect(settingsSections(manifests, admin).map((s) => s.key)).toEqual(["budget", "app"]);
  });
});

describe("currentSection", () => {
  const user = ["inventory", "app"];

  it("shows the section the address asks for when the person can use it", () => {
    expect(currentSection(user, "app")).toBe("app");
    expect(currentSection(user, "inventory")).toBe("inventory");
  });

  it("still leads the old address of the App section, Appearance, to it", () => {
    expect(currentSection(user, "appearance")).toBe("app");
  });

  it("sends the address of a section that is not there (the Registry one, while it is off) to the first of the person", () => {
    expect(currentSection(["budget", "inventory", "register", "app"], "registry")).toBe("budget");
  });

  it("falls back to the first section of the person: no section asked, one that does not exist, or one that is not theirs", () => {
    expect(currentSection(user, undefined)).toBe("inventory");
    expect(currentSection(user, "nowhere")).toBe("inventory");
    expect(currentSection(user, "budget")).toBe("inventory");
    expect(currentSection(["app"], "register")).toBe("app");
  });
});
