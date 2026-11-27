import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ADMIN, createUser, resetData, testApp } from "../../../test/helpers";
import { db } from "../../db/client";
import { appUser, area } from "../../db/schema/platform";

const api = testApp();
afterAll(() => api.close());
beforeEach(async () => {
  await resetData();
  await createUser(ADMIN); // some tests demote the admin
});

const areaId = async (code: string) => (await db.select().from(area).where(eq(area.code, code)))[0]!.id;

/** Makes the signed-in default admin (admin@team.test) the only active admin. */
async function soleAdmin() {
  const me = (await api.get("/api/me")).body;
  await db.update(appUser).set({ role: "viewer" }).where(eq(appUser.role, "admin"));
  await db.update(appUser).set({ role: "admin" }).where(eq(appUser.id, me.id));
  return me.id as number;
}

describe("users", () => {
  it("lists everybody with role, active flag and areas (admins only)", async () => {
    const pm = await createUser({ email: "pm@team.test", role: "pm", areas: ["sw", "mt-dmt"] });
    const list = (await api.get("/api/users")).body;
    expect(list.find((u: any) => u.id === pm.id)).toMatchObject({
      email: "pm@team.test", role: "pm", active: true, areaIds: [...pm.areaIds].sort((a, b) => a - b),
    });
    expect((await api.as({ email: "pm@team.test", role: "pm" }).get("/api/users")).status).toBe(403);
  });

  it("offers the boxes the modules declare, to the admins, and says who may have each", async () => {
    const boxes = (await api.get("/api/flags")).body;
    expect(boxes.map((b: { key: string }) => b.key)).toEqual(["treasury", "sponsors"]);
    expect(boxes[0]).toMatchObject({ key: "treasury", label: "Treasury", roles: ["pm"] });
    expect(boxes[1]).toMatchObject({ key: "sponsors", label: "Sponsors", roles: ["pm"] });
    expect((await api.as({ email: "pm@team.test", role: "pm" }).get("/api/flags")).status).toBe(403);
  });

  it("sets the whole list of boxes at once, refuses one nobody declares or one the role cannot have, and tells the person who they are", async () => {
    const person = await createUser({ email: "boxes@team.test", role: "pm" });
    expect((await api.patch(`/api/users/${person.id}`, { flags: ["sponsors", "treasury"] })).body.flags).toEqual(["sponsors", "treasury"]);
    expect((await api.patch(`/api/users/${person.id}`, { flags: ["treasury"] })).body.flags).toEqual(["treasury"]); // the list is what is wanted
    expect((await api.patch(`/api/users/${person.id}`, { active: false })).body.flags).toEqual(["treasury"]); // what is not mentioned stays
    expect((await api.patch(`/api/users/${person.id}`, { flags: ["payroll"] })).status).toBe(400);
    const refused = await api.patch(`/api/users/${(await createUser({ email: "viewer-box@team.test", role: "viewer" })).id}`, { flags: ["treasury"] });
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/Treasury box is for project managers/);
    expect((await api.get("/api/users")).body.find((u: { id: number }) => u.id === person.id).flags).toEqual(["treasury"]);
    expect((await api.as({ email: "me-boxes@team.test", role: "pm", treasury: true, sponsors: true }).get("/api/me")).body.flags).toEqual(["sponsors", "treasury"]);
  });

  it("keeps the box of a module that is off while it waits, but a person made something else loses it", async () => {
    const person = await createUser({ email: "sleeping-box@team.test", role: "pm", treasury: true, sponsors: true });
    expect((await api.patch("/api/modules/treasury", { enabled: false })).status).toBe(204);
    // the treasury is off: its box is not offered, and changing the others leaves it where it is
    expect((await api.patch(`/api/users/${person.id}`, { flags: [] })).body.flags).toEqual(["treasury"]);
    // made a viewer, the person can have neither box: the one of the module that is off goes too
    expect((await api.patch(`/api/users/${person.id}`, { role: "viewer" })).body.flags).toEqual([]);
    expect((await api.patch("/api/modules/treasury", { enabled: true })).status).toBe(204);
    expect((await api.get("/api/users")).body.find((u: { id: number }) => u.id === person.id).flags).toEqual([]);
  });

  it("changes role, areas and the active flag", async () => {
    const person = await createUser({ email: "someone@team.test", role: "viewer" });
    const sw = await areaId("sw");

    const promoted = await api.patch(`/api/users/${person.id}`, { role: "pm", areaIds: [sw] });
    expect(promoted.body).toMatchObject({ role: "pm", areaIds: [sw], active: true });

    const swapped = await api.patch(`/api/users/${person.id}`, { areaIds: [await areaId("mt-dmt")] });
    expect(swapped.body.areaIds).toEqual([await areaId("mt-dmt")]);

    const cleared = await api.patch(`/api/users/${person.id}`, { areaIds: [], active: false });
    expect(cleared.body).toMatchObject({ areaIds: [], active: false });
  });

  it("applies a change at once to a person who is signed in", async () => {
    const person = { email: "someone@team.test", role: "pm" as const, areas: ["sw"] };
    const as = api.as(person);
    expect((await as.post("/api/budget/projects", { areaCode: "sw", name: "A" })).status).toBe(201);
    const id = (await createUser(person)).id;
    await api.patch(`/api/users/${id}`, { areaIds: [] });
    expect((await as.post("/api/budget/projects", { areaCode: "sw", name: "B" })).status).toBe(403);
    await api.patch(`/api/users/${id}`, { active: false });
    expect((await as.get("/api/me")).status).toBe(401);
  });

  it("rejects unknown areas, unknown users and bad input", async () => {
    const person = await createUser({ email: "someone@team.test", role: "viewer" });
    expect((await api.patch(`/api/users/${person.id}`, { areaIds: [999999] })).status).toBe(400);
    expect((await api.patch("/api/users/999999", { role: "pm" })).status).toBe(404);
    expect((await api.patch(`/api/users/${person.id}`, { role: "owner" })).status).toBe(400);
  });

  it("only an admin can change users", async () => {
    const person = await createUser({ email: "someone@team.test", role: "viewer" });
    for (const role of ["pm", "viewer"] as const) {
      const as = api.as({ email: `${role}@team.test`, role });
      expect((await as.patch(`/api/users/${person.id}`, { role: "admin" })).status).toBe(403);
    }
  });

  it("never leaves the system without an active admin", async () => {
    const me = await soleAdmin();
    expect((await api.patch(`/api/users/${me}`, { role: "viewer" })).status).toBe(409);
    expect((await api.patch(`/api/users/${me}`, { active: false })).status).toBe(409);

    // with a second admin, the first can step down
    const second = await createUser({ email: "second@team.test", role: "viewer" });
    await api.patch(`/api/users/${second.id}`, { role: "admin" });
    expect((await api.patch(`/api/users/${me}`, { role: "viewer" })).status).toBe(200);
  });
});
