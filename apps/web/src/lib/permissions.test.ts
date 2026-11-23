import { describe, expect, it } from "vitest";
import type { Me } from "../api/types";
import { canEditArea, isReadOnlyHere, lockEditing, ROLE_NAME } from "./permissions";

const person = (role: Me["role"], areaIds: number[] = []): Me => ({
  id: 1,
  email: "a@b.test",
  name: "A",
  role,
  areaIds,
  permissions: { canEditShared: false, canManageCash: false, canChangeInflows: false, canManageSuppliers: false, canManageInventory: false, canViewHistory: false, canManageUsers: false, canManageSettings: false },
  editOnPhone: true,
  modules: { registry: true },
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

describe("ROLE_NAME", () => {
  it("calls the project manager a user, as the Users page does", () => {
    expect([ROLE_NAME.admin, ROLE_NAME.pm, ROLE_NAME.viewer]).toEqual(["admin", "user", "viewer"]);
  });
});

describe("read-only on a phone", () => {
  const everything = {
    ...person("admin", [1, 2]),
    permissions: { canEditShared: true, canManageCash: true, canChangeInflows: true, canManageSuppliers: true, canManageInventory: true, canViewHistory: true, canManageUsers: true, canManageSettings: true },
  };

  it("is on only for a phone, and only when an admin turned editing off", () => {
    expect(isReadOnlyHere({ ...everything, editOnPhone: false }, true)).toBe(true);
    expect(isReadOnlyHere({ ...everything, editOnPhone: false }, false)).toBe(false); // a computer
    expect(isReadOnlyHere({ ...everything, editOnPhone: true }, true)).toBe(false); // allowed
  });

  it("takes away every command that changes something, even from an admin, and leaves the ones that only look", () => {
    const locked = lockEditing(everything);
    expect(locked.permissions).toEqual({ canEditShared: false, canManageCash: false, canChangeInflows: false, canManageSuppliers: false, canManageInventory: false, canViewHistory: true, canManageUsers: false, canManageSettings: false });
    expect(locked.role).toBe("admin"); // who they are does not change
    expect(canEditArea(locked, 1)).toBe(false);
    expect(canEditArea(everything, 1)).toBe(true);
  });

  it("leaves the person as they were: a copy, not the same object", () => {
    lockEditing(everything);
    expect(everything.permissions.canManageInventory).toBe(true);
    expect(everything.readOnly).toBeUndefined();
  });
});
