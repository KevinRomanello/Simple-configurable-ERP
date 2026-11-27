import { createHmac } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ADMIN, createUser, resetData, testApp } from "../../../test/helpers";
import { db } from "../../db/client";
import { auditLog } from "../../db/schema/platform";
import { regRecord } from "../../db/schema/registry";

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

/** A registry like the team's: Areas (Tag), People (Name, Surname, Email, State, Area, lookups, formula, CF). */
async function teamSchema() {
  const areas = ok(await api.post("/api/registry/tables", { name: "Areas", section: "HR" }), 201);
  ok(await api.patch(`/api/registry/fields/${areas.fields[0].id}`, { name: "Tag" }));
  const people = ok(await api.post("/api/registry/tables", { name: "People", section: "HR" }), 201);
  const field = async (body: object) => ok(await api.post(`/api/registry/tables/People/fields`, body), 201);
  await field({ name: "Surname", type: "text", options: { transform: "title" } });
  await field({ name: "Email", type: "email", unique: true });
  await field({ name: "State", type: "select", options: { choices: ["Waiting", "In trial", "Active Member", "Alumno"].map((name) => ({ name })) } });
  await field({ name: "Area", type: "link", options: { tableId: "Areas", multiple: false }, inverseName: "Members" });
  await field({ name: "Area Tag", type: "lookup", options: { linkFieldId: "Area", fieldId: "Tag" } });
  const full = await field({ name: "Full Name", type: "formula", options: { expression: 'CONCAT({Name}, " ", {Surname})' } });
  await field({ name: "CF", type: "text" });
  ok(await api.patch("/api/registry/tables/People", { primaryFieldId: full.id }));
  const [sw, hw] = ok(await api.post("/api/registry/tables/Areas/records", [{ fields: { Tag: "SW" } }, { fields: { Tag: "HW" } }]), 201);
  const add = async (fields: object) => ok(await api.post("/api/registry/tables/People/records", { fields }), 201);
  const anna = await add({ Name: "anna", Surname: "bianchi", Email: "Anna@Team.test", State: "Active Member", Area: [sw.id], CF: "AAA" });
  const luca = await add({ Name: "Luca", Surname: "Verdi", Email: "luca@team.test", State: "In trial", Area: [sw.id], CF: "BBB" });
  const sara = await add({ Name: "Sara", Surname: "Neri", Email: "sara@team.test", State: "Alumno", Area: [hw.id] });
  return { areas, people: ok(await api.get("/api/registry/tables/People")), sw, hw, anna, luca, sara };
}

/** Makes People the people table, with Email as the sign-in email, and a group of the current members. */
async function peopleSettings(t: Awaited<ReturnType<typeof teamSchema>>) {
  const email = t.people.fields.find((f: any) => f.name === "Email");
  ok(await api.put("/api/registry/settings", { peopleTableId: t.people.id, emailFieldId: email.id }));
  const members = ok(await api.post("/api/registry/tables/People/views", { name: "Members", type: "grid", config: { group: true, filter: { join: "and", items: [{ field: "State", op: "anyOf", value: ["In trial", "Active Member"] }] } } }), 201);
  return { members };
}

describe("the name of the records", () => {
  it("is a field with one value that reads as a name: a link, a lookup or a file cannot be it, a text or a formula can", async () => {
    const t = await teamSchema();
    const field = (name: string) => t.people.fields.find((f: any) => f.name === name);
    for (const refused of ["Area", "Area Tag", "CF"].filter((n) => field(n)?.type !== "text")) {
      const reply = await api.patch("/api/registry/tables/People", { primaryFieldId: field(refused).id });
      expect([refused, reply.status]).toEqual([refused, 400]);
      expect(reply.body.error).toMatch(/cannot name the records/);
    }
    // the name stays what it was after a refusal, and a text or a formula is taken
    expect(ok(await api.get("/api/registry/tables/People")).primaryFieldId).toBe(field("Full Name").id);
    ok(await api.patch("/api/registry/tables/People", { primaryFieldId: field("Surname").id }));
    ok(await api.patch("/api/registry/tables/People", { primaryFieldId: field("Full Name").id }));
    // and a link shows the name of the record it points to, whichever field that is
    const area = ok(await api.get(`/api/registry/tables/People/records/${t.anna.id}`)).fields.Area;
    expect(area).toEqual([{ id: t.sw.id, name: "SW" }]);
  });
});

describe("tables, fields and records", () => {
  it("make a table, fields of every kind and records, worked out like NocoDB", async () => {
    const t = await teamSchema();
    expect(t.anna.fields).toMatchObject({ Name: "anna", Surname: "Bianchi", Email: "anna@team.test", State: "Active Member", Area: [{ id: t.sw.id, name: "SW" }], "Area Tag": ["SW"], "Full Name": "anna Bianchi" });
    // the other side of a link exists by itself and reads the same links
    const area = ok(await api.get(`/api/registry/tables/Areas/records/${t.sw.id}`));
    expect(area.fields.Members).toEqual([{ id: t.anna.id, name: "anna Bianchi" }, { id: t.luca.id, name: "Luca Verdi" }]);
    // a formula is shown with names and kept with ids: renaming a field keeps it working
    const name = t.people.fields.find((f: any) => f.name === "Name");
    ok(await api.patch(`/api/registry/fields/${name.id}`, { name: "First Name" }));
    const table = ok(await api.get("/api/registry/tables/People"));
    expect(table.fields.find((f: any) => f.name === "Full Name").options.expression).toBe('CONCAT({First Name}, " ", {Surname})');
    expect(ok(await api.get(`/api/registry/tables/People/records/${t.luca.id}`)).fields["Full Name"]).toBe("Luca Verdi");
  });

  it("list with where (NocoDB), a JSON filter, sort, search, chosen fields and pages", async () => {
    await teamSchema();
    const names = (body: any) => body.records.map((r: any) => r.fields["Full Name"]);
    const current = ok(await api.get(`/api/registry/tables/People/records?where=${encodeURIComponent("(State,anyof,In trial,Active Member)")}&sort=-Surname`));
    expect(names(current)).toEqual(["Luca Verdi", "anna Bianchi"]);
    expect(current.total).toBe(2);
    const filter = JSON.stringify({ join: "and", items: [{ field: "Area", op: "anyOf", value: ["HW"] }] });
    expect(names(ok(await api.get(`/api/registry/tables/People/records?filter=${encodeURIComponent(filter)}`)))).toEqual(["Sara Neri"]);
    expect(names(ok(await api.get("/api/registry/tables/People/records?q=verdi")))).toEqual(["Luca Verdi"]);
    const page = ok(await api.get("/api/registry/tables/People/records?fields=Full%20Name,State&sort=Surname&limit=1&offset=1"));
    expect(page.records).toEqual([expect.objectContaining({ fields: { "Full Name": "Sara Neri", State: "Alumno" } })]);
    expect(page.total).toBe(3);
    const grouped = ok(await api.get("/api/registry/tables/People/records?groupBy=State"));
    expect(grouped.groups).toEqual([{ key: "In trial", keys: ["In trial"], count: 1 }, { key: "Active Member", keys: ["Active Member"], count: 1 }, { key: "Alumno", keys: ["Alumno"], count: 1 }]);
    expect((await api.get("/api/registry/tables/People/records?where=(Nope,eq,1)")).status).toBe(400);
  });

  it("refuse wrong values, duplicates, empty required fields and stale versions, with a sentence", async () => {
    const t = await teamSchema();
    const bad = await api.post("/api/registry/tables/People/records", { fields: { Name: "X", Email: "not an email" } });
    expect(bad).toMatchObject({ status: 400, body: { error: "Email: not a valid email address" } });
    const twice = await api.post("/api/registry/tables/People/records", { fields: { Name: "Copy", Email: "ANNA@team.test" } });
    expect(twice).toMatchObject({ status: 409, body: { error: 'Email: "anna@team.test" is already used by another record' } });
    const name = t.people.fields.find((f: any) => f.name === "Name");
    ok(await api.patch(`/api/registry/fields/${name.id}`, { required: true }));
    expect((await api.post("/api/registry/tables/People/records", { fields: { Surname: "Nobody" } })).body.error).toBe("Name is required");
    expect((await api.patch(`/api/registry/tables/People/records/${t.anna.id}`, { fields: { "Full Name": "x" } })).body.error).toContain("is worked out");
    const fresh = ok(await api.patch(`/api/registry/tables/People/records/${t.anna.id}`, { fields: { State: "Alumno" }, version: t.anna.version }));
    expect(fresh.version).toBe(t.anna.version + 1);
    expect((await api.patch(`/api/registry/tables/People/records/${t.anna.id}`, { fields: { State: "Waiting" }, version: t.anna.version })).status).toBe(409);
    // many records at once: all or none
    const batch = await api.post("/api/registry/tables/People/records", [{ fields: { Name: "One", Email: "one@team.test" } }, { fields: { Name: "Two", Email: "one@team.test" } }]);
    expect(batch.status).toBe(409);
    expect(ok(await api.get("/api/registry/tables/People/records")).total).toBe(3);
  });

  it("a calendar or a timeline needs a date field; a kanban and a gallery keep their field", async () => {
    await teamSchema();
    ok(await api.post("/api/registry/tables/People/fields", { name: "Since", type: "date" }), 201);
    expect((await api.post("/api/registry/tables/People/views", { name: "Cal", type: "calendar" })).body.error).toBe("A calendar or a timeline needs the date field");
    expect((await api.post("/api/registry/tables/People/views", { name: "Cal", type: "calendar", config: { dateField: "State" } })).body.error).toBe("State is not a date");
    const calendar = ok(await api.post("/api/registry/tables/People/views", { name: "Cal", type: "calendar", config: { dateField: "Since" } }), 201);
    const timeline = ok(await api.post("/api/registry/tables/People/views", { name: "Line", type: "timeline", config: { dateField: "Since", endDateField: "Since" } }), 201);
    const kanban = ok(await api.post("/api/registry/tables/People/views", { name: "Board", type: "kanban", config: { groupBy: "State" } }), 201);
    const table = ok(await api.get("/api/registry/tables/People"));
    const since = table.fields.find((f: any) => f.name === "Since").id;
    expect([calendar.config.dateField, timeline.config.endDateField]).toEqual([since, since]);
    expect(kanban.type).toBe("kanban");
    // deleting the date field takes it out of the views
    ok(await api.del(`/api/registry/fields/${since}`), 204);
    expect(ok(await api.get("/api/registry/tables/People")).views.find((v: any) => v.name === "Cal").config.dateField).toBeUndefined();
  });

  it("a single link stays single from the other side too, and links can be added and taken away", async () => {
    const t = await teamSchema();
    // putting Luca among the Members of HW takes him out of SW
    ok(await api.post(`/api/registry/tables/Areas/records/${t.hw.id}/links/Members`, { ids: [t.luca.id] }));
    expect(ok(await api.get(`/api/registry/tables/People/records/${t.luca.id}`)).fields.Area).toEqual([{ id: t.hw.id, name: "HW" }]);
    expect(ok(await api.get(`/api/registry/tables/Areas/records/${t.sw.id}`)).fields.Members.map((m: any) => m.id)).toEqual([t.anna.id]);
    ok(await api.del(`/api/registry/tables/Areas/records/${t.hw.id}/links/Members?ids=${t.luca.id}`));
    expect(ok(await api.get(`/api/registry/tables/People/records/${t.luca.id}`)).fields.Area).toEqual([]);
    expect((await api.patch(`/api/registry/tables/People/records/${t.luca.id}`, { fields: { Area: [99999] } })).body.error).toBe("Area: there is no record #99999 to link");
  });

  it("changing a type converts the values; deleting a field is refused while something uses it", async () => {
    const t = await teamSchema();
    const state = t.people.fields.find((f: any) => f.name === "State");
    const converted = ok(await api.patch(`/api/registry/fields/${state.id}`, { type: "text" }));
    expect(converted.lostValues).toBe(0);
    expect(ok(await api.get(`/api/registry/tables/People/records/${t.anna.id}`)).fields.State).toBe("Active Member");
    const area = t.people.fields.find((f: any) => f.name === "Area");
    expect((await api.del(`/api/registry/fields/${area.id}`)).body.error).toBe("Area is used by People › Area Tag: change that first");
    const cf = t.people.fields.find((f: any) => f.name === "CF");
    expect((await api.del(`/api/registry/fields/${cf.id}`)).status).toBe(204);
    // the values went with it
    const [row] = await db.select().from(regRecord).where(eq(regRecord.id, t.anna.id));
    expect(String(cf.id) in (row!.data as object)).toBe(false);
    expect((await api.del("/api/registry/tables/Areas")).body.error).toContain("links to this table");
  });

  it("keeps the history of a record, field by field, and the CSV goes out and comes back", async () => {
    const t = await teamSchema();
    ok(await api.patch(`/api/registry/tables/People/records/${t.luca.id}`, { fields: { State: "Active Member" } }));
    const history = ok(await api.get(`/api/registry/tables/People/records/${t.luca.id}/history`));
    expect(history[0]).toMatchObject({ action: "update", actor: expect.any(String), changes: [{ field: "State", before: "In trial", after: "Active Member" }] });
    expect(history.some((h: any) => h.action === "link" && h.changes[0].field === "Area")).toBe(true);

    const exported = await exportCsv();
    expect(exported.split("\r\n")[0]).toBe("﻿Name,Surname,Email,State,Area");
    expect(exported).toContain("anna,Bianchi,anna@team.test,Active Member,SW");

    const check = ok(await api.post("/api/registry/tables/People/import", { csv: "Name,Email,State,Area,Unknown\nGiulia,giulia@team.test,Waiting,HW,x\nLuca,luca@team.test,Alumno,SW,y", mode: "upsert", key: "Email" }));
    expect(check).toMatchObject({ rows: 2, create: 1, update: 1, ignoredColumns: ["Unknown"], errors: [], saved: false });
    const saved = ok(await api.post("/api/registry/tables/People/import", { csv: "Name,Email,State,Area\nGiulia,giulia@team.test,Waiting,HW\nLuca,luca@team.test,Alumno,SW", mode: "upsert", key: "Email", dryRun: false }));
    expect(saved.saved).toBe(true);
    expect(ok(await api.get(`/api/registry/tables/People/records/${t.luca.id}`)).fields.State).toBe("Alumno");
    const wrong = ok(await api.post("/api/registry/tables/People/import", { csv: "Name,Area\nX,Nowhere", dryRun: false }));
    expect(wrong).toMatchObject({ saved: false, errors: [{ row: 2, message: 'Area: no record called "Nowhere"' }] });
  });

  async function exportCsv() {
    const reply = await api.get("/api/registry/tables/People/export.csv?fields=Name,Surname,Email,State,Area&sort=Surname");
    return typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body);
  }
});

describe("comments, summaries and the description of the API", () => {
  it("who reads a record comments on it; only the author or who manages the table deletes a comment", async () => {
    const t = await teamSchema();
    ok(await api.patch("/api/registry/tables/People", { access: [{ who: { kind: "everyone" }, level: "read", hidden: ["CF"] }] }));
    const member = api.as({ email: "member@team.test", role: "viewer" });
    const after = ok(await member.post(`/api/registry/tables/People/records/${t.anna.id}/comments`, { text: "Called her today" }), 201);
    expect(after).toEqual([expect.objectContaining({ text: "Called her today", author: "member", mine: true })]);
    const mine = after[0].id;
    ok(await api.post(`/api/registry/tables/People/records/${t.anna.id}/comments`, { text: "Thanks" }), 201);
    const all = ok(await member.get(`/api/registry/tables/People/records/${t.anna.id}/comments`));
    expect(all.map((c: any) => [c.text, c.mine])).toEqual([["Called her today", true], ["Thanks", false]]);
    expect((await member.del(`/api/registry/comments/${all[1].id}`)).status).toBe(403);
    ok(await member.del(`/api/registry/comments/${mine}`), 204);
    ok(await api.del(`/api/registry/comments/${all[1].id}`), 204);
    // a record one cannot see does not exist for them
    expect((await api.as({ email: "stranger@team.test", role: "viewer" }).post(`/api/registry/tables/Areas/records/${t.sw.id}/comments`, { text: "x" })).status).toBe(404);
  });

  it("sums up fields over every record that matches, and refuses the fields one cannot see", async () => {
    await teamSchema();
    const counted = ok(await api.get(`/api/registry/tables/People/records?limit=1&aggregate=${encodeURIComponent("count:CF,empty:CF,unique:State,min:Surname")}`));
    expect(counted.aggregates).toEqual([
      { field: "CF", fn: "count", value: 2 }, { field: "CF", fn: "empty", value: 1 }, { field: "State", fn: "unique", value: 3 }, { field: "Surname", fn: "min", value: "Bianchi" },
    ]);
    expect((await api.get("/api/registry/tables/People/records?aggregate=mode:CF")).status).toBe(400);
    ok(await api.patch("/api/registry/tables/People", { access: [{ who: { kind: "everyone" }, level: "read", hidden: ["CF"] }] }));
    expect((await api.as({ email: "member@team.test", role: "viewer" }).get("/api/registry/tables/People/records?aggregate=count:CF")).status).toBe(400);
  });

  it("describes the API of the tables the person can see, with their fields and what can be written", async () => {
    await teamSchema();
    ok(await api.patch("/api/registry/tables/People", { access: [{ who: { kind: "everyone" }, level: "read", hidden: ["CF"] }] }));
    const doc = ok(await api.get("/api/registry/openapi.json"));
    expect(Object.keys(doc.paths)).toContain("/registry/tables/People/records");
    expect(doc.components.schemas.People.properties.fields.properties.State).toMatchObject({ type: "string", enum: ["Waiting", "In trial", "Active Member", "Alumno"] });
    expect(doc.components.schemas.People_input.properties.fields.properties.Area).toMatchObject({ type: "array", items: { type: "integer" } });
    expect(doc.components.schemas.People_input.properties.fields.properties["Full Name"]).toBeUndefined();
    const member = ok(await api.as({ email: "member@team.test", role: "viewer" }).get("/api/registry/openapi.json"));
    expect(member.components.schemas.People.properties.fields.properties.CF).toBeUndefined();
    expect(member.components.schemas.People_input.properties.fields.properties).toEqual({});
    expect(Object.keys(member.paths).some((p) => p.includes("Areas"))).toBe(false);
  });
});

describe("permissions", () => {
  it("without rules only the admins see a table; rules give read with hidden fields, and filtering on them is refused", async () => {
    const t = await teamSchema();
    const member = api.as({ email: "member@team.test", role: "viewer" });
    expect((await member.get("/api/registry/tables/People/records")).status).toBe(403);
    expect(ok(await member.get("/api/registry/tables"))).toEqual([]);
    const cf = t.people.fields.find((f: any) => f.name === "CF");
    ok(await api.patch("/api/registry/tables/People", { access: [{ who: { kind: "everyone" }, level: "read", hidden: ["CF"] }] }));
    const seen = ok(await member.get("/api/registry/tables/People/records"));
    expect(seen.records[0].fields.CF).toBeUndefined();
    expect(seen.fields.map((f: any) => f.name)).not.toContain("CF");
    expect((await member.get(`/api/registry/tables/People/records?where=${encodeURIComponent("(CF,eq,AAA)")}`)).status).toBe(400);
    expect((await member.get(`/api/registry/tables/People/records?sort=CF`)).status).toBe(400);
    expect((await member.patch(`/api/registry/tables/People/records/${t.anna.id}`, { fields: { State: "Waiting" } })).status).toBe(403);
    // the history of a record hides the hidden fields too, and the raw history page is for the admins
    ok(await api.patch(`/api/registry/tables/People/records/${t.anna.id}`, { fields: { CF: "CHANGED" } }));
    expect(ok(await member.get(`/api/registry/tables/People/records/${t.anna.id}/history`)).some((h: any) => h.changes.some((c: any) => c.field === "CF"))).toBe(false);
    const pm = api.as({ email: "pm@team.test", role: "pm" });
    expect(ok(await pm.get("/api/audit?limit=500")).entries.some((e: any) => e.table.startsWith("reg_"))).toBe(false);
    expect(ok(await api.get("/api/audit?limit=500")).entries.some((e: any) => e.table === "reg_record" && cf)).toBe(true);
  });

  it("a group edits some fields only; a person edits only their own record", async () => {
    const t = await teamSchema();
    const { members } = await peopleSettings(t);
    ok(await api.patch("/api/registry/tables/People", {
      access: [
        { who: { kind: "group", groupId: members.id }, level: "edit", hidden: ["CF"], readOnly: ["Name", "Surname", "Email", "Area"] },
        { who: { kind: "self" }, level: "edit", readOnly: ["State"] },
      ],
    }));
    const luca = api.as({ email: "luca@team.test", role: "viewer" });
    const sara = api.as({ email: "sara@team.test", role: "viewer" });
    // Luca is a member: he changes the state of anybody, not their names
    ok(await luca.patch(`/api/registry/tables/People/records/${t.anna.id}`, { fields: { State: "In trial" } }));
    expect((await luca.patch(`/api/registry/tables/People/records/${t.anna.id}`, { fields: { Surname: "X" } })).body.error).toBe("You cannot change Surname");
    // ...but his own surname yes: the rule on his own record allows it
    ok(await luca.patch(`/api/registry/tables/People/records/${t.luca.id}`, { fields: { Surname: "verdini" } }));
    // Sara is an Alumno: only her own record, and not its state
    expect(ok(await sara.get("/api/registry/tables/People/records")).records.map((r: any) => r.id)).toEqual([t.sara.id]);
    expect((await sara.patch(`/api/registry/tables/People/records/${t.sara.id}`, { fields: { State: "Active Member" } })).body.error).toBe("You cannot change State");
    expect((await sara.get(`/api/registry/tables/People/records/${t.anna.id}`)).status).toBe(404);
    expect(ok(await sara.get("/api/registry/me"))).toMatchObject({ personId: t.sara.id, groups: [] });
    expect(ok(await luca.get("/api/registry/me")).groups).toEqual([{ id: members.id, name: "Members" }]);
    // only the admins make tables
    expect((await luca.post("/api/registry/tables", { name: "Mine" })).status).toBe(403);
  });
});

describe("forms", () => {
  it("a public application: a candidate without an account, the form sets the state, the duplicate is refused", async () => {
    await teamSchema();
    const regDate = ok(await api.post("/api/registry/tables/People/fields", { name: "Registration Date", type: "date" }), 201);
    const form = ok(await api.post("/api/registry/tables/People/views", {
      name: "Application", type: "form", slug: "apply",
      config: { form: { access: { kind: "public" }, mode: "create", fields: [{ fieldId: "Name", required: true }, { fieldId: "Surname" }, { fieldId: "Email", required: true }, { fieldId: "Area" }], set: [{ fieldId: "State", value: "Waiting" }, { fieldId: regDate.id, value: "today" }], successMessage: "See you soon" } },
    }), 201);
    const nobody = api.anonymous();
    const page = ok(await nobody.get("/api/registry/public/forms/apply"));
    expect(page.questions.map((q: any) => q.label)).toEqual(["Name", "Surname", "Email", "Area"]);
    expect(page.questions[3].choices.map((c: any) => c.name)).toEqual(["HW", "SW"]);
    const sent = ok(await nobody.post("/api/registry/public/forms/apply", { answers: { Name: "giulia", Surname: "rosa", Email: "Giulia@Uni.test", Area: [page.questions[3].choices[1].id], State: "Active Member" } }));
    expect(sent).toMatchObject({ ok: true, message: "See you soon", recordId: null });
    const created = ok(await api.get(`/api/registry/tables/People/records?where=${encodeURIComponent("(Email,eq,giulia@uni.test)")}`)).records[0];
    // the state is the form's, not the one sent: State is not a question
    expect(created.fields).toMatchObject({ Surname: "Rosa", State: "Waiting", "Registration Date": expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), "Area Tag": ["SW"] });
    const again = await nobody.post("/api/registry/public/forms/apply", { answers: { Name: "Giulia", Email: "giulia@uni.test" } });
    expect(again).toMatchObject({ status: 409, body: { error: 'Email: "giulia@uni.test" is already used by another record' } });
    const missing = await nobody.post("/api/registry/public/forms/apply", { answers: { Surname: "x", Email: "bad" } });
    expect(missing.status).toBe(400);
    expect(missing.body.details.map((d: any) => d.message)).toEqual(["Email: not a valid email address", "Name is required"]);
    // the history knows it came from nobody signed in
    const [entry] = await db.select().from(auditLog).where(and(eq(auditLog.tableName, "reg_record"), eq(auditLog.rowId, created.id)));
    expect(entry?.actorId).toBeNull();
    expect(form.slug).toBe("apply");
  });

  it("members update their own record; a personal link opens one record; a group picks from a view", async () => {
    const t = await teamSchema();
    const { members } = await peopleSettings(t);
    const exitDate = ok(await api.post("/api/registry/tables/People/fields", { name: "Exit Date", type: "date" }), 201);
    ok(await api.post("/api/registry/tables/People/views", { name: "Exit", type: "form", slug: "exit", config: { form: { access: { kind: "members" }, mode: "update", target: "me", fields: [{ fieldId: "Surname" }], set: [{ fieldId: "State", value: "Alumno" }, { fieldId: exitDate.id, value: "today" }] } } }), 201);
    const luca = api.as({ email: "luca@team.test", role: "viewer" });
    // the public address never knows who is there, even signed in: it says to sign in
    const unknown = await luca.get("/api/registry/public/forms/exit");
    expect(unknown).toMatchObject({ status: 401, body: { code: "sign-in-needed" } });
    expect(ok(await luca.get("/api/registry/forms/by-slug/exit")).current).toEqual({ [t.people.fields.find((f: any) => f.name === "Surname").id]: "Verdi" });
    ok(await luca.post("/api/registry/forms/by-slug/exit", { answers: { Surname: "Verdi" } }));
    expect(ok(await api.get(`/api/registry/tables/People/records/${t.luca.id}`)).fields.State).toBe("Alumno");
    expect((await api.anonymous().post("/api/registry/public/forms/exit", { answers: {} })).status).toBe(401);
    expect((await api.anonymous().post("/api/registry/forms/by-slug/exit", { answers: {} })).status).toBe(401);
    expect((await api.as({ email: "stranger@team.test", role: "viewer" }).post("/api/registry/forms/by-slug/exit", { answers: {} })).status).toBe(404);

    const onboarding = ok(await api.post("/api/registry/tables/People/views", { name: "Onboarding", type: "form", slug: "onboarding", config: { form: { access: { kind: "public" }, mode: "update", target: "link", fields: [{ fieldId: "CF", required: true }], set: [{ fieldId: "State", value: "In trial" }] } } }), 201);
    const link = ok(await api.post(`/api/registry/forms/${onboarding.id}/links`, { recordId: t.sara.id, days: 2 }));
    expect(link.path).toMatch(/^\/forms\/onboarding\?t=/);
    const nobody = api.anonymous();
    expect((await nobody.post("/api/registry/public/forms/onboarding", { answers: { CF: "SSS" } })).status).toBe(403);
    expect((await nobody.post("/api/registry/public/forms/onboarding", { answers: { CF: "SSS" }, token: link.token.replace(/.$/, (c: string) => (c === "a" ? "b" : "a")) })).body.error).toBe("This link is not valid: ask for a new one");
    const forged = link.token.replace(`.${t.sara.id}.`, `.${t.anna.id}.`);
    expect((await nobody.post("/api/registry/public/forms/onboarding", { answers: { CF: "X" }, token: forged })).status).toBe(403);
    ok(await nobody.post("/api/registry/public/forms/onboarding", { answers: { CF: "SSS" }, token: link.token }));
    expect(ok(await api.get(`/api/registry/tables/People/records/${t.sara.id}`)).fields).toMatchObject({ CF: "SSS", State: "In trial" });

    const recruits = ok(await api.post("/api/registry/tables/People/views", { name: "Recruits", type: "grid", config: { filter: { join: "and", items: [{ field: "State", op: "eq", value: "In trial" }] } } }), 201);
    ok(await api.post("/api/registry/tables/People/views", { name: "Scouting", type: "form", slug: "scouting", config: { form: { access: { kind: "group", groupId: members.id }, mode: "update", target: "pick", pickViewId: recruits.id, fields: [{ fieldId: "State", required: true }] } } }), 201);
    const anna = api.as({ email: "anna@team.test", role: "viewer" });
    expect(ok(await anna.get("/api/registry/forms/by-slug/scouting")).pick.map((p: any) => p.id)).toEqual([t.sara.id]);
    expect((await anna.post("/api/registry/forms/by-slug/scouting", { answers: { State: "Active Member" }, recordId: t.anna.id })).body.error).toBe("That record cannot be chosen here");
    ok(await anna.post("/api/registry/forms/by-slug/scouting", { answers: { State: "Active Member" }, recordId: t.sara.id }));
    expect((await api.as({ email: "nobody@team.test", role: "viewer" }).get("/api/registry/forms/by-slug/scouting")).status).toBe(403);
    expect(ok(await anna.get("/api/registry/forms")).map((f: any) => f.slug).sort()).toEqual(["exit", "scouting"]);
  });

  it("files come with the form and are shown only if they really are what they say", async () => {
    await teamSchema();
    ok(await api.post("/api/registry/tables/People/fields", { name: "CV", type: "attachment", options: { accept: ["application/pdf"], maxSizeMb: 1, maxFiles: 1 } }), 201);
    ok(await api.post("/api/registry/tables/People/views", { name: "Apply", type: "form", slug: "apply", config: { form: { access: { kind: "public" }, mode: "create", fields: [{ fieldId: "Name" }, { fieldId: "Email" }, { fieldId: "CV", required: true }] } } }), 201);
    const nobody = api.anonymous();
    const pdf = Buffer.from("%PDF-1.4 fake").toString("base64");
    expect((await nobody.post("/api/registry/public/forms/apply", { answers: { Name: "A", Email: "a@uni.test" } })).body.error).toBe("CV is required");
    expect((await nobody.post("/api/registry/public/forms/apply", { answers: { Name: "A", Email: "a@uni.test" }, files: { CV: [{ name: "cv.png", mime: "image/png", data: pdf }] } })).body.error).toBe("CV: cv.png is not of an accepted type");
    ok(await nobody.post("/api/registry/public/forms/apply", { answers: { Name: "A", Email: "a@uni.test" }, files: { CV: [{ name: "cv.pdf", mime: "application/pdf", data: pdf }] } }));
    const record = ok(await api.get(`/api/registry/tables/People/records?where=${encodeURIComponent("(Email,eq,a@uni.test)")}`)).records[0];
    expect(record.fields.CV).toEqual([{ id: expect.any(Number), name: "cv.pdf", mime: "application/pdf", size: 13 }]);
    const file = await api.app.inject({ method: "GET", url: `/api/registry/files/${record.fields.CV[0].id}`, headers: { cookie: await adminCookie() } });
    expect(file.statusCode).toBe(200);
    expect(file.headers["content-type"]).toBe("application/pdf");
    expect(file.headers["content-disposition"]).toContain("inline");
    // a "PDF" that is not one is downloaded, never shown
    const upload = await api.app.inject({ method: "POST", url: `/api/registry/tables/People/records/${record.id}/files/CV?name=x.pdf`, headers: { cookie: await adminCookie(), "content-type": "application/pdf" }, payload: Buffer.from("<html>x</html>") });
    expect(upload.statusCode).toBe(400); // one file at most
    ok(await api.del(`/api/registry/files/${record.fields.CV[0].id}`), 204);
    const again = await api.app.inject({ method: "POST", url: `/api/registry/tables/People/records/${record.id}/files/CV?name=x.pdf`, headers: { cookie: await adminCookie(), "content-type": "application/pdf" }, payload: Buffer.from("<html>x</html>") });
    expect(again.statusCode).toBe(201);
    const fake = await api.app.inject({ method: "GET", url: `/api/registry/files/${again.json().fields.CV[0].id}`, headers: { cookie: await adminCookie() } });
    expect(fake.headers["content-type"]).toBe("application/octet-stream");
    expect(fake.headers["content-disposition"]).toContain("attachment");
    expect((await api.as({ email: "x@team.test", role: "viewer" }).get(`/api/registry/files/${again.json().fields.CV[0].id}`)).status).toBe(404);
  });
});

async function adminCookie() {
  const { cookieFor } = await import("../../../test/helpers");
  return cookieFor((await createUser(ADMIN)).id);
}

describe("webhooks, buttons, shared views, tokens", () => {
  it("tell n8n after a change, signed, with a filter; a button calls its webhook", async () => {
    const received: { headers: IncomingMessage["headers"]; body: any }[] = [];
    const server = createServer((request, response) => {
      let data = "";
      request.on("data", (chunk) => (data += chunk));
      request.on("end", () => {
        received.push({ headers: request.headers, body: JSON.parse(data) });
        response.end("ok");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
    try {
      const t = await teamSchema();
      const hook = ok(await api.post("/api/registry/tables/People/webhooks", { name: "n8n", url, events: ["update"], filter: { join: "and", items: [{ field: "State", op: "eq", value: "Alumno" }] } }), 201);
      ok(await api.patch(`/api/registry/tables/People/records/${t.anna.id}`, { fields: { State: "In trial" } }));
      ok(await api.patch(`/api/registry/tables/People/records/${t.luca.id}`, { fields: { State: "Alumno" } }));
      await waitFor(() => received.length >= 1);
      expect(received).toHaveLength(1);
      const [call] = received;
      expect(call!.body).toMatchObject({ event: "update", table: { name: "People" }, source: "api", record: { id: t.luca.id, fields: { State: "Alumno" } }, previous: { fields: { State: "In trial" } }, actor: { email: ADMIN.email } });
      const expected = `sha256=${createHmac("sha256", hook.secret).update(JSON.stringify(call!.body)).digest("hex")}`;
      expect(call!.headers["x-registry-signature"]).toBe(expected);
      await waitFor(async () => ok(await api.get(`/api/registry/webhooks/${hook.id}/log`)).length > 0);
      expect(ok(await api.get(`/api/registry/webhooks/${hook.id}/log`))[0]).toMatchObject({ event: "update", status: 200, error: null });

      ok(await api.post("/api/registry/tables/People/fields", { name: "Create Account", type: "button", options: { label: "Create", webhookId: hook.id } }), 201);
      ok(await api.post(`/api/registry/tables/People/records/${t.anna.id}/buttons/Create Account`.replace(" ", "%20"), {}), 202);
      await waitFor(() => received.length >= 2);
      expect(received[1]!.body).toMatchObject({ event: "button", source: "button:Create Account", record: { id: t.anna.id } });
      expect((await api.del(`/api/registry/webhooks/${hook.id}`)).body.error).toContain("calls this webhook");
    } finally {
      server.close();
    }
  });

  it("a shared view is open to anybody, with its fields only", async () => {
    await teamSchema();
    ok(await api.post("/api/registry/tables/People/views", { name: "Website", type: "grid", slug: "members", config: { shared: true, hidden: ["CF", "Email"], filter: { join: "and", items: [{ field: "State", op: "eq", value: "Active Member" }] } } }), 201);
    const page = ok(await api.anonymous().get("/api/registry/public/views/members"));
    expect(page.records).toHaveLength(1);
    expect(page.records[0].fields["Full Name"]).toBe("anna Bianchi");
    expect(page.records[0].fields.CF).toBeUndefined();
    expect((await api.anonymous().get("/api/registry/public/views/nope")).status).toBe(404);
    expect((await api.anonymous().get("/api/registry/tables")).status).toBe(401);
  });

  it("a service acts with a token as its user; a revoked token stops at once", async () => {
    await teamSchema();
    const service = ok(await api.post("/api/users", { email: "n8n@service.test", name: "n8n", role: "viewer" }), 201);
    const token = ok(await api.post("/api/tokens", { name: "n8n", userId: service.id }), 201);
    expect(token.token).toMatch(/^erp_/);
    const bearer = { authorization: `Bearer ${token.token}` };
    expect((await api.anonymous().get("/api/me", bearer)).body.email).toBe("n8n@service.test");
    // a viewer: no rule lets it see People yet
    expect((await api.anonymous().get("/api/registry/tables/People/records", bearer)).status).toBe(403);
    ok(await api.patch("/api/registry/tables/People", { access: [{ who: { kind: "everyone" }, level: "read" }] }));
    expect(ok(await api.anonymous().get("/api/registry/tables/People/records", bearer)).total).toBe(3);
    expect(ok(await api.get("/api/tokens"))[0]).toMatchObject({ name: "n8n", userEmail: "n8n@service.test", revokedAt: null });
    expect(JSON.stringify(ok(await api.get("/api/tokens")))).not.toContain(token.token);
    ok(await api.del(`/api/tokens/${token.id}`), 204);
    expect((await api.anonymous().get("/api/me", bearer)).status).toBe(401);
    expect((await api.anonymous().get("/api/me", { authorization: "Bearer erp_forged" })).status).toBe(401);
    expect((await api.as({ email: "pm@team.test", role: "pm" }).get("/api/tokens")).status).toBe(403);
  });
});

describe("the roles of the ERP from the registry", () => {
  it("previews, applies, follows every change of the registry and locks the Users page", async () => {
    const t = await teamSchema();
    const { members } = await peopleSettings(t);
    const roles = ok(await api.post("/api/registry/tables/People/fields", { name: "Roles", type: "multiselect", options: { choices: [{ name: "CT" }, { name: "TL" }, { name: "TR" }] } }), 201);
    const view = async (name: string, value: string) =>
      ok(await api.post("/api/registry/tables/People/views", { name, type: "grid", config: { group: true, filter: { join: "and", items: [{ field: roles.id, op: "anyOf", value: [value] }] } } }), 201);
    const ct = await view("Core Team", "CT");
    const tl = await view("Team Leaders", "TL");
    const tr = await view("Treasury", "TR");
    ok(await api.patch(`/api/registry/tables/People/records/${t.anna.id}`, { fields: { Roles: ["CT"] } }));
    ok(await api.patch(`/api/registry/tables/People/records/${t.luca.id}`, { fields: { Roles: ["TR"] } }));
    const areaTag = t.people.fields.find((f: any) => f.name === "Area Tag");

    // without the group of who may enter it does not start
    expect((await api.put("/api/registry-access/role-sync", { enabled: true })).status).toBe(400);
    const choices = { activeViewId: members.id, adminViewId: tl.id, pmViewId: ct.id, pmAreasFieldId: areaTag.id, treasuryViewId: tr.id };
    const preview = ok(await api.post("/api/registry-access/role-sync/preview", choices));
    expect(preview.warnings).toEqual([]);
    const anna = preview.changes.find((c: any) => c.email === "anna@team.test");
    // (Anna may have an account from another test: made or changed, she becomes a User of SW)
    expect(anna.changes).toMatchObject({ role: { to: "pm" }, areaIds: { to: [expect.any(Number)] } });
    // Luca keeps the money: a User with the Treasury box, and no area
    expect(preview.changes.find((c: any) => c.email === "luca@team.test").changes).toMatchObject({ role: { to: "pm" }, treasury: { to: true } });
    // Sara is an Alumno: no account is made for her, and one she had is switched off
    const sara = preview.changes.find((c: any) => c.email === "sara@team.test");
    expect(sara === undefined || (sara.create === false && sara.changes.active.to === false)).toBe(true);

    const applied = ok(await api.put("/api/registry-access/role-sync", { ...choices, enabled: true }));
    expect(applied.applied).toBe(preview.changes.length);
    const users = ok(await api.get("/api/users"));
    const annaUser = users.find((u: any) => u.email === "anna@team.test");
    expect(annaUser).toMatchObject({ role: "pm", active: true, managed: true });
    expect(users.find((u: any) => u.email === ADMIN.email).managed).toBe(false);
    expect((await api.patch(`/api/users/${annaUser.id}`, { role: "admin" })).status).toBe(409);

    // a change in the registry changes the account in the same moment: Anna leaves
    ok(await api.patch(`/api/registry/tables/People/records/${t.anna.id}`, { fields: { State: "Alumno" } }));
    expect(ok(await api.get("/api/users")).find((u: any) => u.email === "anna@team.test")).toMatchObject({ active: false });
    // ...and she cannot sign in any more
    const { cookieFor } = await import("../../../test/helpers");
    expect((await api.app.inject({ method: "GET", url: "/api/me", headers: { cookie: await cookieFor(annaUser.id) } })).statusCode).toBe(401);
    // the group in use cannot stop being a group
    expect((await api.patch(`/api/registry/views/${ct.id}`, { config: { group: false } })).body.error).toBe("This group is used by a role of the ERP (Settings › Access): change that first");
    // ...and the field the areas come from cannot go: rolesync says so, the registry does not know it
    expect((await api.del(`/api/registry/fields/${areaTag.id}`)).body.error).toBe("Area Tag is used by the areas of the roles of the ERP (Settings › Access): change that first");
  });
});

async function waitFor(check: () => boolean | Promise<boolean>, ms = 3_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out");
}
