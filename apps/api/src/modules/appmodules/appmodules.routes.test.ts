import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ADMIN, createUser, resetData, testApp } from "../../../test/helpers";

const api = testApp();
afterAll(() => api.close());
beforeEach(async () => {
  await resetData();
  await createUser(ADMIN);
});

const ok = <T = any>(reply: { status: number; body: any }, status = 200): T => {
  if (reply.status !== status) throw new Error(`Expected ${status}, got ${reply.status}: ${JSON.stringify(reply.body)}`);
  return reply.body as T;
};
const turn = (enabled: boolean) => api.patch("/api/modules/registry", { enabled });
const pm = { email: "pm@team.test", role: "pm" as const };
const viewer = { email: "viewer@team.test", role: "viewer" as const };

describe("the modules that can be turned off", () => {
  it("are all on to start with, and everybody who is signed in knows it", async () => {
    expect(ok(await api.get("/api/me")).modules).toEqual({ registry: true });
    expect(ok(await api.get("/api/modules"))).toEqual([expect.objectContaining({ key: "registry", label: "Registry", enabled: true })]);
  });

  it("answer not found while they are off, on every address of the module, public ones and the services' too", async () => {
    ok(await api.post("/api/registry/tables", { name: "People" }), 201);
    expect((await turn(false)).status).toBe(204);
    expect(ok(await api.get("/api/me")).modules).toEqual({ registry: false });
    for (const [method, url] of [["get", "/api/registry/tables"], ["get", "/api/registry/forms"], ["get", "/api/registry/public/forms/apply"], ["get", "/api/role-sync"], ["get", "/api/registry/tables/People/records"]] as const) {
      const reply = await api[method](url);
      expect([method, url, reply.status]).toEqual([method, url, 404]);
      expect(reply.body).toEqual({ error: "The Registry module is turned off", code: "module-off" });
    }
    // the keys of the services belong to the whole ERP, not to the registry: the same ones keep working
    expect((await api.get("/api/tokens")).status).toBe(200);
    expect((await api.get("/api/areas")).status).toBe(200);
  });

  it("bring everything back as it was when they are turned on again", async () => {
    const table = ok(await api.post("/api/registry/tables", { name: "People" }), 201);
    ok(await api.post("/api/registry/tables/People/records", { fields: { Name: "Anna" } }), 201);
    await turn(false);
    expect((await api.get(`/api/registry/tables/${table.id}`)).status).toBe(404);
    expect((await turn(true)).status).toBe(204);
    expect(ok(await api.get("/api/me")).modules).toEqual({ registry: true });
    expect(ok(await api.get("/api/registry/tables/People/records")).records).toHaveLength(1);
  });

  it("are the admins' to turn on and off, and to see in the list", async () => {
    for (const person of [pm, viewer]) {
      const as = api.as(person);
      expect((await as.patch("/api/modules/registry", { enabled: false })).status).toBe(403);
      expect((await as.get("/api/modules")).status).toBe(403);
      expect((await as.get("/api/me")).body.modules).toEqual({ registry: true }); // but they know what is on
    }
    expect(ok(await api.get("/api/modules"))[0].enabled).toBe(true);
  });

  it("refuse a module that does not exist and a switch that is not on or off", async () => {
    expect((await api.patch("/api/modules/payroll", { enabled: false })).status).toBe(404);
    expect((await api.patch("/api/modules/registry", { enabled: "no" })).status).toBe(400);
    expect((await api.patch("/api/modules/registry", {})).status).toBe(400);
  });

  it("go into the History with who did it", async () => {
    await turn(false);
    await turn(true);
    const { entries } = ok(await api.get("/api/audit?table=app_module"));
    expect(entries.map((e: { action: string }) => e.action)).toEqual(["update", "insert"]);
    expect(entries[0]).toMatchObject({ label: "module registry", actor: { email: ADMIN.email } });
    expect(entries[0].changes.find((c: { field: string }) => c.field === "enabled")).toEqual({ field: "enabled", before: false, after: true });
  });

  it("give the accounts back to the Users page while the registry is off: nothing is taken from it any more", async () => {
    const people = ok(await api.post("/api/registry/tables", { name: "People" }), 201);
    const email = ok(await api.post("/api/registry/tables/People/fields", { name: "Email", type: "email", unique: true }), 201);
    ok(await api.post("/api/registry/tables/People/records", { fields: { Name: "Anna", Email: "anna@team.test" } }), 201);
    ok(await api.put("/api/registry/settings", { peopleTableId: people.id, emailFieldId: email.id }));
    const members = ok(await api.post("/api/registry/tables/People/views", { name: "Members", type: "grid", config: { group: true } }), 201);
    ok(await api.put("/api/role-sync", { activeViewId: members.id, enabled: true }));
    const managed = async () => ((await api.get("/api/users")).body as { email: string; managed: boolean }[]).find((u) => u.email === "anna@team.test")?.managed;
    expect(await managed()).toBe(true);
    await turn(false);
    expect(await managed()).toBe(false);
    await turn(true);
    expect(await managed()).toBe(true);
  });
});
