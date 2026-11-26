import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN, createUser, resetData, testApp } from "../../../test/helpers";
import { loadUser } from "../../platform/users/users.service";
import { registryWrite, saveRecords } from "./registry.write";

// The services of NocoDB the registry gives too (docs/anagrafiche-nocodb.md): the API v3 endpoints (count,
// linked records, upsert), the newer field types and defaults, bulk changes, copies, webhooks with method,
// headers, body and "becomes", comments, shared views with a password, exports.

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

/** People (Name, State, Area link, Rating) and Areas, with three made-up people. */
async function schema() {
  ok(await api.post("/api/registry/tables", { name: "Areas" }), 201);
  ok(await api.post("/api/registry/tables", { name: "People" }), 201);
  const field = async (body: object) => ok(await api.post("/api/registry/tables/People/fields", body), 201);
  await field({ name: "State", type: "select", options: { choices: [{ name: "Waiting", color: "#FFEEAA" }, { name: "Active" }] } });
  await field({ name: "Area", type: "link", options: { tableId: "Areas", multiple: true }, inverseName: "People" });
  await field({ name: "Rating", type: "number" });
  const [sw, hw] = ok(await api.post("/api/registry/tables/Areas/records", [{ fields: { Name: "SW" } }, { fields: { Name: "HW" } }]), 201);
  const people = ok(await api.post("/api/registry/tables/People/records", [
    { fields: { Name: "Anna", State: "Active", Area: [sw.id, hw.id], Rating: 8 } },
    { fields: { Name: "Luca", State: "Waiting", Area: [sw.id], Rating: 5 } },
    { fields: { Name: "Sara", State: "Waiting", Rating: 7 } },
  ]), 201);
  return { sw, hw, anna: people[0], luca: people[1], sara: people[2] };
}

/** A web server that keeps what it receives (a webhook of n8n). */
async function catcher() {
  const received: { method: string; headers: IncomingMessage["headers"]; body: string }[] = [];
  const server = createServer((request, response) => {
    let data = "";
    request.on("data", (chunk) => (data += chunk));
    request.on("end", () => {
      received.push({ method: request.method ?? "", headers: request.headers, body: data });
      response.end("ok");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { received, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`, close: () => server.close() };
}

async function waitFor(check: () => boolean, ms = 3_000) {
  const until = Date.now() + ms;
  while (Date.now() < until && !check()) await new Promise((resolve) => setTimeout(resolve, 25));
  if (!check()) throw new Error("Timed out");
}

describe("the data API of NocoDB", () => {
  it("count, pages with next, fields by id, two levels of groups, linked records a page at a time", async () => {
    const t = await schema();
    expect(ok(await api.get(`/api/registry/tables/People/count?where=${encodeURIComponent("(State,eq,Waiting)")}`))).toEqual({ count: 2 });
    const first = ok(await api.get("/api/registry/tables/People/records?page=1&pageSize=2&sort=Name"));
    expect(first).toMatchObject({ page: 1, next: 2, total: 3 });
    expect(ok(await api.get("/api/registry/tables/People/records?page=2&pageSize=2&sort=Name")).records.map((r: any) => r.fields.Name)).toEqual(["Sara"]);
    const table = ok(await api.get("/api/registry/tables/People"));
    const rating = table.fields.find((f: any) => f.name === "Rating");
    expect(ok(await api.get(`/api/registry/tables/People/records?fieldKey=id&sort=Name&fields=Rating`)).records[0].fields).toEqual({ [rating.id]: 8 });
    const groups = ok(await api.get("/api/registry/tables/People/records?groupBy=State,Rating")).groups;
    expect(groups.map((g: any) => g.keys)).toEqual([["Waiting", "5"], ["Waiting", "7"], ["Active", "8"]]);
    const linked = ok(await api.get(`/api/registry/tables/People/records/${t.anna.id}/links/Area?limit=1`));
    expect(linked).toMatchObject({ total: 2, records: [{ id: t.sw.id, name: "SW" }] });
    expect(ok(await api.get(`/api/registry/tables/People/records/${t.anna.id}/links/Area?q=h`)).records).toEqual([{ id: t.hw.id, name: "HW" }]);
  });

  it("upsert, bulk update and delete by a where, duplicate a record", async () => {
    const t = await schema();
    const result = ok(await api.post("/api/registry/tables/People/records/upsert", { match: ["Name"], records: [{ fields: { Name: "luca", Rating: 9 } }, { fields: { Name: "Marco", State: "Waiting" } }] }));
    expect(result).toMatchObject({ created: 1, updated: 1 });
    expect(ok(await api.get(`/api/registry/tables/People/records/${t.luca.id}`)).fields.Rating).toBe(9);
    expect((await api.post("/api/registry/tables/People/records/upsert", { match: ["Name"], records: [{ fields: { Rating: 1 } }] })).status).toBe(400);

    expect(ok(await api.post("/api/registry/tables/People/records/bulk-update", { where: "(State,eq,Waiting)", fields: { State: "Active" } }))).toEqual({ updated: 3 });
    expect(ok(await api.get("/api/registry/tables/People/count?where=(State,eq,Active)")).count).toBe(4);
    expect((await api.post("/api/registry/tables/People/records/bulk-update", { fields: { State: "Active" } })).status).toBe(400);

    const copy = ok(await api.post(`/api/registry/tables/People/records/${t.anna.id}/duplicate`, {}), 201);
    expect(copy.id).not.toBe(t.anna.id);
    expect(copy.fields).toMatchObject({ Name: "Anna", State: "Active", Rating: 8, Area: [{ name: "SW" }, { name: "HW" }] });

    expect(ok(await api.post("/api/registry/tables/People/records/bulk-delete", { where: "(Name,eq,Anna)" }))).toEqual({ deleted: 2 });
    expect(ok(await api.get("/api/registry/tables/People/count")).count).toBe(3);
  });

  it("the where of NocoDB with quotes, ~not, sub-operators of dates and isWithin", async () => {
    await schema();
    ok(await api.post("/api/registry/tables/People/fields", { name: "Joined", type: "date" }), 201);
    const today = new Date().toISOString().slice(0, 10);
    const old = new Date(Date.now() - 40 * 86_400_000).toISOString().slice(0, 10);
    const ids = (await api.get("/api/registry/tables/People/records?sort=Name")).body.records.map((r: any) => r.id);
    ok(await api.patch("/api/registry/tables/People/records", [{ id: ids[0], fields: { Joined: today } }, { id: ids[1], fields: { Joined: old } }]));
    const names = async (where: string) => ok(await api.get(`/api/registry/tables/People/records?sort=Name&where=${encodeURIComponent(where)}`)).records.map((r: any) => r.fields.Name);
    expect(await names("(Joined,eq,today)")).toEqual(["Anna"]);
    expect(await names("(Joined,lt,daysAgo,30)")).toEqual(["Luca"]);
    expect(await names("(Joined,isWithin,pastNumberOfDays,7)")).toEqual(["Anna"]);
    expect(await names('~not("Name", eq, "Anna")')).toEqual(["Luca", "Sara"]);
    expect(await names("(State,nallof,Waiting)")).toEqual(["Anna"]);
    expect((await api.get(`/api/registry/tables/People/records?where=${encodeURIComponent("(Joined,isWithin,someday)")}`)).body.error).toBe('where: Unknown period "someday"');
  });
});

describe("the fields of NocoDB", () => {
  it("time, duration, coordinates, colour, user and uuid", async () => {
    await schema();
    const field = async (body: object) => ok(await api.post("/api/registry/tables/People/fields", body), 201);
    await field({ name: "Starts", type: "time" });
    await field({ name: "Lab hours", type: "duration", options: { durationFormat: "h:mm" } });
    await field({ name: "Home", type: "geodata" });
    await field({ name: "Colour", type: "color" });
    await field({ name: "Owner", type: "user", options: { default: "@me" } });
    // a uuid field gives one to the records already there, and nobody writes it
    await field({ name: "Key", type: "uuid" });
    const all = ok(await api.get("/api/registry/tables/People/records")).records;
    expect(all.every((r: any) => /^[0-9a-f-]{36}$/.test(r.fields.Key))).toBe(true);
    expect((await api.patch(`/api/registry/tables/People/records/${all[0].id}`, { fields: { Key: "x" } })).body.error).toBe("Key is worked out: it cannot be written");

    const made = ok(await api.post("/api/registry/tables/People/records", { fields: { Name: "Nuovo", Starts: "2:30 pm", "Lab hours": "12:30", Home: "46.0664, 11.1257", Colour: "abc" } }), 201);
    expect(made.fields).toMatchObject({ Starts: "14:30:00", "Lab hours": 45000, Home: "46.0664;11.1257", Colour: "#AABBCC", Owner: [{ name: expect.any(String) }], Key: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    expect((await api.post("/api/registry/tables/People/records", { fields: { Name: "X", Owner: [999_999] } })).body.error).toBe("Owner: there is no user #999999");
    // the default is for what is not given: emptied on purpose it stays empty
    expect(ok(await api.post("/api/registry/tables/People/records", { fields: { Name: "Y", Owner: null } }), 201).fields.Owner).toEqual([]);
    const users = ok(await api.get("/api/registry/users"));
    expect(users.map((u: any) => Object.keys(u).sort())).toContainEqual(["id", "name"]);
    expect(ok(await api.get(`/api/registry/tables/People/records?where=${encodeURIComponent("(Owner,eq,@me)")}`)).total).toBe(1);
  });

  it("default values: fixed and today, refused with unique; a button that opens an address", async () => {
    await schema();
    ok(await api.post("/api/registry/tables/People/fields", { name: "Since", type: "date", options: { default: "today" } }), 201);
    ok(await api.patch("/api/registry/fields/" + ok(await api.get("/api/registry/tables/People")).fields.find((f: any) => f.name === "State").id, { options: { default: "Waiting" } }));
    const made = ok(await api.post("/api/registry/tables/People/records", { fields: { Name: "Nuovo" } }), 201);
    expect(made.fields).toMatchObject({ State: "Waiting", Since: new Date().toISOString().slice(0, 10) });
    expect((await api.post("/api/registry/tables/People/fields", { name: "Code", type: "text", unique: true, options: { default: "A" } })).body.error).toMatch(/unique field cannot have a default/);
    expect((await api.post("/api/registry/tables/People/fields", { name: "Odd", type: "select", options: { choices: [{ name: "A" }], default: "B" } })).body.error).toMatch(/Default value/);

    ok(await api.post("/api/registry/tables/People/fields", { name: "Search", type: "button", options: { label: "Search", url: '"https://www.google.com/search?q=" & URLENCODE({Name})' } }), 201);
    const pressed = ok(await api.post(`/api/registry/tables/People/records/${made.id}/buttons/Search`, {}));
    expect(pressed).toEqual({ ok: true, url: "https://www.google.com/search?q=Nuovo" });
    ok(await api.post("/api/registry/tables/People/fields", { name: "Bad", type: "button", options: { label: "Bad", url: '"javascript:alert(1)"' } }), 201);
    expect((await api.post(`/api/registry/tables/People/records/${made.id}/buttons/Bad`, {})).body.error).toBe("Bad: the formula does not make a web address");
  });

  it("formulas with the functions of NocoDB", async () => {
    await schema();
    ok(await api.post("/api/registry/tables/People/fields", { name: "Code", type: "formula", options: { expression: 'CONCAT(UPPER(LEFT({Name}, 2)), "-", RECORD_ID(), "-", ROUNDUP({Rating} / 3, 1))' } }), 201);
    ok(await api.post("/api/registry/tables/People/fields", { name: "Week", type: "formula", options: { expression: 'WEEKNUM("2026-11-21", "monday")' } }), 201);
    const anna = ok(await api.get("/api/registry/tables/People/records?where=(Name,eq,Anna)")).records[0];
    expect(anna.fields.Code).toBe(`AN-${anna.id}-2.7`);
    expect(anna.fields.Week).toBe(47);
    expect((await api.post("/api/registry/tables/People/fields", { name: "Bad", type: "formula", options: { expression: "NOSUCH(1)" } })).body.error).toBe("Formula: Unknown function NOSUCH");
  });
});

describe("views, copies, files", () => {
  it("colours, a locked view, its filters and sorts alone, copies of a view, a field and a table", async () => {
    await schema();
    const view = ok(await api.post("/api/registry/tables/People/views", { name: "Board", type: "grid", config: { colorBy: "State", colors: [{ filter: { join: "and", items: [{ field: "Rating", op: "gte", value: 8 }] }, color: "#E8F0FE" }], rowHeight: "tall", frozen: 1, locked: true } }), 201);
    const records = ok(await api.get(`/api/registry/tables/People/records?view=${view.id}&sort=Name`)).records;
    expect(records.map((r: any) => r.color)).toEqual(["#E8F0FE", "#FFEEAA", "#FFEEAA"]);
    // locked: nothing changes until it is unlocked (in the same request it may change)
    expect((await api.patch(`/api/registry/views/${view.id}`, { config: { rowHeight: "short", locked: true } })).status).toBe(409);
    expect((await api.put(`/api/registry/views/${view.id}/sorts`, { sorts: [{ field: "Rating", dir: "desc" }] })).status).toBe(409);
    ok(await api.patch(`/api/registry/views/${view.id}`, { config: { ...ok(await api.get(`/api/registry/views/${view.id}`)).config, locked: false } }));
    expect(ok(await api.put(`/api/registry/views/${view.id}/sorts`, { sorts: [{ field: "Rating", dir: "desc" }] })).sorts).toHaveLength(1);
    expect(ok(await api.put(`/api/registry/views/${view.id}/filters`, { filter: { join: "and", items: [{ field: "State", op: "eq", value: "Waiting" }] } })).filter.items).toHaveLength(1);
    expect(ok(await api.get(`/api/registry/views/${view.id}/filters`)).filter.items[0].op).toBe("eq");

    const copy = ok(await api.post(`/api/registry/views/${view.id}/duplicate`, {}), 201);
    expect(copy).toMatchObject({ name: "Board copy", config: { rowHeight: "tall", frozen: 1 } });
    const rating = ok(await api.get("/api/registry/tables/People")).fields.find((f: any) => f.name === "Rating");
    const ratingCopy = ok(await api.post(`/api/registry/fields/${rating.id}/duplicate`, {}), 201);
    expect(ratingCopy.name).toBe("Rating copy");
    expect(ok(await api.get("/api/registry/tables/People/records?sort=Name")).records[0].fields["Rating copy"]).toBe(8);
    expect(ok(await api.get(`/api/registry/fields/${ratingCopy.id}`)).type).toBe("number");

    const table = ok(await api.post("/api/registry/tables/People/duplicate", { records: true }), 201);
    expect(table.name).toBe("People copy");
    // the links are made in pairs: they stay out of a copy, and it says so
    expect(table.skippedFields).toEqual(["Area"]);
    expect(ok(await api.get("/api/registry/tables/People%20copy/count")).count).toBe(3);
    // the views come along, with their filter (only Waiting by now) and colours
    expect(ok(await api.get(`/api/registry/tables/People%20copy/records?sort=Name&view=Board`)).records.map((r: any) => [r.fields.Name, r.color])).toEqual([["Luca", "#FFEEAA"], ["Sara", "#FFEEAA"]]);
  });

  it("a table from a CSV, with the type of each column guessed", async () => {
    const csv = "Name,Born,Email,Score,Member\nAnna,2001-03-04,anna@uni.test,7.5,yes\nLuca,05/06/2002,luca@uni.test,6,no\n";
    const table = ok(await api.post("/api/registry/tables/import", { name: "Candidates", csv }), 201);
    expect(table.fields.map((f: any) => `${f.name}:${f.type}`)).toEqual(["Name:text", "Born:date", "Email:email", "Score:number", "Member:checkbox"]);
    const rows = ok(await api.get("/api/registry/tables/Candidates/records?sort=Name")).records;
    expect(rows[1].fields).toMatchObject({ Name: "Luca", Born: "2002-06-05", Score: 6, Member: false });
    expect((await api.post("/api/registry/tables/import", { name: "Candidates", csv })).status).toBe(409);
  });

  it("JSON and iCalendar files, and a shared view with a password that lets people download it", async () => {
    await schema();
    ok(await api.post("/api/registry/tables/People/fields", { name: "Interview", type: "date" }), 201);
    const anna = ok(await api.get("/api/registry/tables/People/records?where=(Name,eq,Anna)")).records[0];
    ok(await api.patch(`/api/registry/tables/People/records/${anna.id}`, { fields: { Interview: "2026-12-01" } }));
    const json = ok(await api.get("/api/registry/tables/People/export.json?sort=Name"));
    expect(json.map((r: any) => r.fields.Name)).toEqual(["Anna", "Luca", "Sara"]);
    const calendar = ok(await api.post("/api/registry/tables/People/views", { name: "Interviews", type: "calendar", config: { dateField: "Interview" } }), 201);
    const ics = await api.get(`/api/registry/tables/People/export.ics?view=${calendar.id}`);
    expect(ics.headers["content-type"]).toContain("text/calendar");
    expect(ics.body).toContain("DTSTART;VALUE=DATE:20261201");
    expect(ics.body).toContain("DTEND;VALUE=DATE:20261202");
    expect(ics.body).toContain("SUMMARY:Anna");
    expect((await api.get("/api/registry/tables/People/export.ics")).status).toBe(400);

    const shared = ok(await api.post("/api/registry/tables/People/views", { name: "Site", type: "grid", slug: "site", config: { shared: true, sharedPassword: "s3cret", sharedDownload: true, hidden: ["Rating"] } }), 201);
    expect(shared.config).toMatchObject({ hasPassword: true });
    expect(shared.config.sharedPassword).toBeUndefined();
    const nobody = api.anonymous();
    expect(await nobody.get("/api/registry/public/views/site")).toMatchObject({ status: 401, body: { code: "password-needed" } });
    expect((await nobody.get("/api/registry/public/views/site", { "x-view-password": "wrong" })).status).toBe(401);
    const page = ok(await nobody.get("/api/registry/public/views/site", { "x-view-password": "s3cret" }));
    expect(page).toMatchObject({ download: true, records: expect.any(Array) });
    expect(page.records[0].fields.Rating).toBeUndefined();
    const file = await nobody.get("/api/registry/public/views/site/export.csv", { "x-view-password": "s3cret" });
    expect(file.status).toBe(200);
    expect(String(file.body)).toContain("Name");
    expect(String(file.body)).not.toContain("Rating");
    // changing the view without a password keeps the one it has; null takes it away
    ok(await api.patch(`/api/registry/views/${shared.id}`, { config: { shared: true, sharedDownload: true } }));
    expect((await nobody.get("/api/registry/public/views/site")).status).toBe(401);
    ok(await api.patch(`/api/registry/views/${shared.id}`, { config: { shared: true, sharedPassword: null } }));
    expect(ok(await nobody.get("/api/registry/public/views/site")).download).toBe(false);
  });
});

describe("webhooks and comments as in NocoDB", () => {
  it("method, headers, a body from a template, only some fields, only when it becomes true", async () => {
    const hook = await catcher();
    try {
      const t = await schema();
      ok(await api.post("/api/registry/tables/People/webhooks", {
        name: "Slack", url: hook.url, events: ["update"], method: "PUT", headers: { Authorization: "Bearer n8n-key" },
        body: '{"text": "{{record.fields.Name}} is {{record.fields.State}} in {{#each record.fields.Area}}{{this.name}}{{#unless @last}}, {{/unless}}{{/each}}"}',
        fields: ["State"], when: "becomes", filter: { join: "and", items: [{ field: "State", op: "eq", value: "Active" }] },
      }), 201);
      // Rating is not one of its fields (no call); Luca becomes Active (a call)
      ok(await api.patch(`/api/registry/tables/People/records/${t.luca.id}`, { fields: { Rating: 6 } }));
      ok(await api.patch(`/api/registry/tables/People/records/${t.luca.id}`, { fields: { State: "Active" } }));
      // Anna was Active already: a change of her state to Active again is not "becoming"
      ok(await api.patch(`/api/registry/tables/People/records/${t.anna.id}`, { fields: { State: "Active", Rating: 9 } }));
      await waitFor(() => hook.received.length >= 1);
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(hook.received).toHaveLength(1);
      expect(hook.received[0]).toMatchObject({ method: "PUT", headers: { authorization: "Bearer n8n-key", "x-registry-event": "update" } });
      expect(JSON.parse(hook.received[0]!.body)).toEqual({ text: "Luca is Active in SW" });
      expect((await api.post("/api/registry/tables/People/webhooks", { name: "Bad", url: hook.url, events: ["update"], body: "{{#if x}}never closed" })).body.error).toBe("Body: A block is not closed");
    } finally {
      hook.close();
    }
  });

  it("comments: changed by their author, resolved, and told to the webhooks of comments", async () => {
    const hook = await catcher();
    try {
      const t = await schema();
      ok(await api.post("/api/registry/tables/People/webhooks", { name: "Comments", url: hook.url, events: ["comment"] }), 201);
      const [comment] = ok(await api.post(`/api/registry/tables/People/records/${t.anna.id}/comments`, { text: "Call her" }), 201);
      await waitFor(() => hook.received.length >= 1);
      expect(JSON.parse(hook.received[0]!.body)).toMatchObject({ event: "comment", comment: { text: "Call her" }, record: { id: t.anna.id } });
      const [edited] = ok(await api.patch(`/api/registry/comments/${comment.id}`, { text: "Call her on Monday" }));
      expect(edited).toMatchObject({ text: "Call her on Monday", editedAt: expect.any(String), resolved: false });
      const [resolved] = ok(await api.post(`/api/registry/comments/${comment.id}/resolve`, { resolved: true }));
      expect(resolved.resolved).toBe(true);
      ok(await api.patch("/api/registry/tables/People", { access: [{ who: { kind: "everyone" }, level: "read" }] }));
      const other = api.as({ email: "member@team.test", role: "viewer" });
      expect((await other.patch(`/api/registry/comments/${comment.id}`, { text: "mine now" })).status).toBe(403);
      expect((await other.post(`/api/registry/comments/${comment.id}/resolve`, { resolved: false })).status).toBe(403);
    } finally {
      hook.close();
    }
  });
});

describe("unique values without a constraint of the database", () => {
  it("ten requests at once with the same email make one record: the table is locked while it is checked", async () => {
    await schema();
    ok(await api.post("/api/registry/tables/People/fields", { name: "Email", type: "email", unique: true }), 201);
    const replies = await Promise.all(Array.from({ length: 10 }, (_, i) => api.post("/api/registry/tables/People/records", { fields: { Name: `Twin ${i}`, Email: "twin@uni.test" } })));
    expect(replies.filter((r) => r.status === 201)).toHaveLength(1);
    expect(replies.filter((r) => r.status === 409)).toHaveLength(9);
    expect(ok(await api.get(`/api/registry/tables/People/count?where=${encodeURIComponent("(Email,eq,twin@uni.test)")}`)).count).toBe(1);
  });

  it("a second writer waits for the first, still open, and then sees its value: the lock of the table", async () => {
    await schema();
    const email = ok(await api.post("/api/registry/tables/People/fields", { name: "Email", type: "email", unique: true }), 201);
    const table = ok(await api.get("/api/registry/tables/People"));
    const actor = (await loadUser((await createUser(ADMIN)).id))!;
    const row = (value: string) => [{ values: new Map<number, unknown>([[email.id, value]]) }];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    // the first saves and keeps its transaction open
    const first = registryWrite(actor, "api", async (w) => {
      await saveRecords(w, table.id, row("same@uni.test"));
      await gate;
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    let secondDone = false;
    const second = registryWrite(actor, "api", (w) => saveRecords(w, table.id, row("same@uni.test"))).finally(() => (secondDone = true));
    await new Promise((resolve) => setTimeout(resolve, 200));
    // still waiting: without the lock it would not see the first record and would save a duplicate
    expect(secondDone).toBe(false);
    release();
    await first;
    await expect(second).rejects.toThrow('Email: "same@uni.test" is already used by another record');
  });
});

describe("the public addresses know nobody", () => {
  it("a form for the members is filled in signed in, at its own address", async () => {
    await schema();
    ok(await api.post("/api/registry/tables/People/views", { name: "Feedback", type: "form", slug: "feedback", config: { form: { access: { kind: "members" }, mode: "create", fields: [{ fieldId: "Name", validate: { minLength: 3, message: "At least three letters" } }], prefill: "lock", submitAnother: true } } }), 201);
    const member = api.as({ email: "member@team.test", role: "viewer" });
    expect(await member.get("/api/registry/public/forms/feedback")).toMatchObject({ status: 401, body: { code: "sign-in-needed" } });
    const page = ok(await member.get("/api/registry/forms/by-slug/feedback"));
    expect(page).toMatchObject({ prefill: "lock", submitAnother: true, access: "members", questions: [{ validate: { minLength: 3 } }] });
    expect((await member.post("/api/registry/forms/by-slug/feedback", { answers: { Name: "Al" } })).body.error).toBe("At least three letters");
    ok(await member.post("/api/registry/forms/by-slug/feedback", { answers: { Name: "Alba" } }));
  });
});

describe("the rest of NocoDB: folders, maps, codes, limited links, group summaries", () => {
  it("views in folders, a map that needs coordinates, its tiles through the server", async () => {
    await schema();
    ok(await api.post("/api/registry/tables/People/fields", { name: "Home", type: "geodata" }), 201);
    expect((await api.post("/api/registry/tables/People/views", { name: "Where", type: "map" })).body.error).toBe("A map needs a field of coordinates");
    expect((await api.post("/api/registry/tables/People/views", { name: "Where", type: "map", config: { geoField: "Rating" } })).body.error).toBe("Rating is not a field of coordinates");
    const map = ok(await api.post("/api/registry/tables/People/views", { name: "Where", type: "map", config: { geoField: "Home", folder: "HR" } }), 201);
    expect(map.config).toMatchObject({ folder: "HR" });
    // the tiles: asked to the tile server once, then kept
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(png, { headers: { "content-type": "image/png" } }));
    try {
      const tile = await api.get("/api/registry/tiles/5/17/11.png");
      expect(tile.status).toBe(200);
      expect(tile.headers["content-type"]).toBe("image/png");
      await api.get("/api/registry/tiles/5/17/11.png");
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(String(fetcher.mock.calls[0]![0])).toBe("https://tile.openstreetmap.org/5/17/11.png");
    } finally {
      fetcher.mockRestore();
    }
    expect((await api.get("/api/registry/tiles/2/9/0.png")).status).toBe(400);
    expect((await api.anonymous().get("/api/registry/tiles/5/17/11.png")).status).toBe(401);
  });

  it("QR codes and barcodes of a field, links limited to a view, a copy of a webhook, summaries of each group", async () => {
    const t = await schema();
    ok(await api.post("/api/registry/tables/People/fields", { name: "Badge", type: "qrcode", options: { fieldId: "Name" } }), 201);
    ok(await api.post("/api/registry/tables/People/fields", { name: "Label", type: "barcode", options: { fieldId: "Name", barcodeFormat: "CODE39" } }), 201);
    expect((await api.post("/api/registry/tables/People/fields", { name: "Bad", type: "barcode", options: {} })).body.error).toBe("Choose the field of this table the code shows");
    expect(ok(await api.get(`/api/registry/tables/People/records/${t.anna.id}`)).fields).toMatchObject({ Badge: "Anna", Label: "Anna" });
    expect((await api.del(`/api/registry/fields/${ok(await api.get("/api/registry/tables/People")).fields.find((f: any) => f.name === "Name").id}`)).body.error).toMatch(/used by People › Badge/);

    const hardware = ok(await api.post("/api/registry/tables/Areas/views", { name: "Hardware", type: "grid", config: { filter: { join: "and", items: [{ field: "Name", op: "eq", value: "HW" }] } } }), 201);
    const area = ok(await api.get("/api/registry/tables/People")).fields.find((f: any) => f.name === "Area");
    ok(await api.patch(`/api/registry/fields/${area.id}`, { options: { limitViewId: hardware.id } }));
    expect((await api.patch(`/api/registry/fields/${area.id}`, { options: { limitViewId: 999_999 } })).status).toBe(400);
    expect(ok(await api.get(`/api/registry/tables/Areas/names?view=${hardware.id}`))).toEqual([{ id: t.hw.id, name: "HW" }]);

    const hook = ok(await api.post("/api/registry/tables/People/webhooks", { name: "n8n", url: "https://n8n.test/x", events: ["update"], method: "PUT" }), 201);
    const copy = ok(await api.post(`/api/registry/webhooks/${hook.id}/duplicate`, {}), 201);
    expect(copy).toMatchObject({ name: "n8n copy", active: false, options: { method: "PUT" } });
    expect(copy.secret).not.toBe(hook.secret);

    const grouped = ok(await api.get("/api/registry/tables/People/records?groupBy=State&aggregate=sum:Rating"));
    expect(grouped.groups.map((g: any) => [g.key, g.aggregates[0].value])).toEqual([["Waiting", 12], ["Active", 8]]);
  });
});
