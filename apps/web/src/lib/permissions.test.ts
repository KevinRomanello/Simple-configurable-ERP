import { describe, expect, it } from "vitest";
import type { Me } from "../api/types";
import { canEditArea } from "./permissions";

const person = (role: Me["role"], areaIds: number[] = []): Me => ({
  id: 1,
  email: "a@b.test",
  name: "A",
  role,
  areaIds,
  permissions: { canEditShared: false, canManageSuppliers: false, canManageInventory: false, canViewHistory: false, canManageUsers: false, canManageSettings: false },
});

describe("canEditArea", () => {
  it("lets an admin edit every area", () => {
    expect(canEditArea(person("admin"), 3)).toBe(true);
  });

  it("lets a project manager edit only the areas assigned to them", () => {
    const pm = person("pm", [1, 2]);
    expect(canEditArea(pm, 2)).toBe(true);
    expect(canEditArea(pm, 3)).toBe(false);
    expect(canEditArea(person("pm"), 1)).toBe(false);
  });

  it("never lets a viewer edit, even with areas left over from an old role", () => {
    expect(canEditArea(person("viewer", [1]), 1)).toBe(false);
  });
});
