import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ADMIN, createUser, resetData, testApp } from "../../../test/helpers";
import { db } from "../../db/client";
import { appUser, area } from "../../db/schema";

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
    expect((await as.post("/api/projects", { areaCode: "sw", name: "A" })).status).toBe(201);
    const id = (await createUser(person)).id;
    await api.patch(`/api/users/${id}`, { areaIds: [] });
    expect((await as.post("/api/projects", { areaCode: "sw", name: "B" })).status).toBe(403);
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
