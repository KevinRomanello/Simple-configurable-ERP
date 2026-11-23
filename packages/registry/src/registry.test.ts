import { describe, expect, it } from "vitest";
import { canSeeTable, groupsOf, personOf, recordPermission, tablePermission, viewerFor } from "./access";
import { fieldProblem } from "./checks";
import { openRegistry, withDraft } from "./compute";
import { parseCsv, toCsv } from "./csv";
import { dropFields, matches, resolveDay } from "./filter";
import { formClosedReason, planSubmission } from "./form";
import { runQuery } from "./query";
import { field, teamRegistry } from "./testing";
import type { ConditionOp, Filter, FormConfig } from "./types";
import { parseWhere } from "./where";

const env = (reg: ReturnType<typeof openRegistry>, me?: { email: string | null; personId: number | null }) => ({ today: reg.snapshot.today, peopleTableId: reg.snapshot.settings.peopleTableId, me });

describe("computed values", () => {
  it("formulas, lookups, rollups and the names of linked records", () => {
    const { snapshot, f } = teamRegistry();
    const reg = openRegistry(snapshot);
    const anna = reg.record(10)!;
    expect(reg.value(anna, f.fullName)).toBe("Anna Bianchi");
    expect(reg.value(anna, f.teamEmail)).toBe("anna.bianchi@team.test");
    expect(reg.value(anna, f.rating)).toBe(7);
    expect(reg.value(anna, f.areaTag)).toEqual(["SW"]);
    expect(reg.output(anna, f.area)).toEqual([{ id: 1, name: "SW" }]);
    expect(reg.value(anna, f.certCount)).toBe(2);
    expect(reg.output(anna, f.certificates)).toEqual([{ id: 20, name: "Medium" }, { id: 21, name: "Fire" }]);
    // the inverse side of a link reads the same rows
    expect(reg.output(reg.record(1)!, f.areaPeople)).toEqual([{ id: 10, name: "Anna Bianchi" }, { id: 11, name: "Luca Verdi" }]);
    expect(reg.value(reg.record(20)!, f.expiry)).toBe("2031-01-09");
    expect(reg.display(10)).toBe("Anna Bianchi");
    expect(reg.display(999)).toBe("#999");
  });

  it("who and when come from the record", () => {
    const { snapshot } = teamRegistry();
    const reg = openRegistry(snapshot);
    const creator = field(2, "By", "creator");
    const when = field(2, "When", "modified");
    expect(reg.value(reg.record(10)!, creator)).toBe("Admin Person");
    expect(reg.value(reg.record(10)!, when)).toBe("2026-11-02T10:00:00.000Z");
  });

  it("a formula that uses itself gives nothing instead of looping", () => {
    const { snapshot } = teamRegistry();
    const loop = field(2, "Loop", "formula");
    loop.options.expression = `{#${loop.id}} + 1`;
    const reg = openRegistry({ ...snapshot, fields: [...snapshot.fields, loop] });
    expect(reg.value(reg.record(10)!, loop)).toBe(1);
  });

  it("a draft changes one record and its links, and leaves the rest alone", () => {
    const { snapshot, f } = teamRegistry();
    const draft = { ...snapshot.records.find((r) => r.id === 11)!, data: { ...snapshot.records.find((r) => r.id === 11)!.data, [f.name.id]: "Lucio" } };
    const reg = openRegistry(withDraft(snapshot, draft, { [f.area.id]: [2] }));
    expect(reg.value(reg.record(11)!, f.fullName)).toBe("Lucio Verdi");
    expect(reg.value(reg.record(11)!, f.areaTag)).toEqual(["HW"]);
    expect(reg.value(reg.record(10)!, f.areaTag)).toEqual(["SW"]);
    // from the other side too: Luca is now among the people of HW
    expect(reg.linkedIds(reg.record(2)!, f.areaPeople)).toEqual([11, 12]);
  });
});

describe("filters and queries", () => {
  const { snapshot, f, PEOPLE } = teamRegistry();
  const reg = openRegistry(snapshot);
  const people = reg.recordsOf(PEOPLE);
  const ids = (filter: Filter, me?: { email: string | null; personId: number | null }) => runQuery(reg, people, { filter }, env(reg, me)).records.map((r) => r.id);
  const one = (field: number, op: ConditionOp, value?: unknown): Filter => ({ join: "and", items: [{ field, op, value }] });

  it("compare texts without regard to case, numbers as numbers, lists by their items", () => {
    expect(ids(one(f.state.id, "eq", "active member"))).toEqual([10]);
    expect(ids(one(f.state.id, "anyOf", "In trial,Active Member"))).toEqual([10, 11]);
    // Anna FLOOR(AVG(8, 7)) = 7, Luca FLOOR(AVG(6, 9)) = 7
    expect(ids(one(f.rating.id, "gte", 7))).toEqual([10, 11]);
    expect(ids(one(f.rating.id, "lt", 7))).toEqual([12, 13]);
    expect(ids(one(f.roles.id, "anyOf", ["CT", "HR"]))).toEqual([10, 12]);
    expect(ids(one(f.roles.id, "empty"))).toEqual([11, 13]);
    expect(ids(one(f.fullName.id, "contains", "ver"))).toEqual([11]);
    expect(ids(one(f.privacy.id, "checked"))).toEqual([10]);
    expect(ids(one(f.privacy.id, "notChecked"))).toEqual([11, 12, 13]);
    expect(ids(one(f.areaTag.id, "eq", "sw"))).toEqual([10, 11]);
  });

  it("links match by id or by name of the linked record", () => {
    expect(ids(one(f.area.id, "anyOf", [2]))).toEqual([12]);
    expect(ids(one(f.area.id, "anyOf", ["sw"]))).toEqual([10, 11]);
    expect(ids(one(f.area.id, "noneOf", ["SW"]))).toEqual([12, 13]);
    expect(ids(one(f.area.id, "empty"))).toEqual([13]);
  });

  it("nest AND and OR", () => {
    const filter: Filter = { join: "or", items: [one(f.state.id, "eq", "Waiting"), { join: "and", items: [{ field: f.state.id, op: "eq", value: "Active Member" }, { field: f.roles.id, op: "anyOf", value: ["CT"] }] }] };
    expect(ids(filter)).toEqual([10, 13]);
  });

  it("@me is the email or the record of whoever looks", () => {
    expect(ids(one(f.teamEmail.id, "eq", "@me"), { email: "luca.verdi@team.test", personId: 11 })).toEqual([11]);
    const certs = reg.recordsOf(3).filter((r) => matches(reg, r, one(f.member.id, "anyOf", ["@me"]), env(reg, { email: null, personId: 10 })));
    expect(certs.map((r) => r.id)).toEqual([20, 21]);
    expect(ids(one(f.teamEmail.id, "eq", "@me"))).toEqual([]);
  });

  it("dates accept today, today-N and today+N", () => {
    expect(resolveDay("today-21", "2026-11-21")).toBe("2026-10-31");
    expect(resolveDay("today+10", "2026-11-21")).toBe("2026-12-01");
    const expired = reg.recordsOf(3).filter((r) => matches(reg, r, one(f.expiry.id, "lt", "today"), env(reg)));
    expect(expired.map((r) => r.id)).toEqual([21]);
  });

  it("search, sort with empty values last, group and page", () => {
    expect(runQuery(reg, people, { search: "bianchi anna", searchFields: [f.fullName] }, env(reg)).records.map((r) => r.id)).toEqual([10]);
    const byRating = runQuery(reg, people, { sorts: [{ field: f.rating.id, dir: "desc" }] }, env(reg));
    // equal ratings keep the order of the records
    expect(byRating.records.map((r) => r.id)).toEqual([10, 11, 12, 13]);
    const byEntry = runQuery(reg, people, { sorts: [{ field: f.entry.id, dir: "desc" }, { field: f.name.id, dir: "asc" }] }, env(reg));
    // nobody has an entry date: all empty, so the second sort decides
    expect(byEntry.records.map((r) => r.id)).toEqual([10, 11, 13, 12]);
    const byState = runQuery(reg, people, { sorts: [{ field: f.state.id, dir: "asc" }] }, env(reg));
    // choices keep their order: Waiting, Project, In trial, Active Member, Reachable, Alumno
    expect(byState.records.map((r) => r.id)).toEqual([13, 11, 10, 12]);
    const grouped = runQuery(reg, people, { groupBy: [f.area.id], limit: 2, offset: 1 }, env(reg));
    expect(grouped.groups).toEqual([{ key: "HW", keys: ["HW"], count: 1 }, { key: "SW", keys: ["SW"], count: 2 }, { key: "", keys: [""], count: 1 }]);
    // two levels: the area, then the state inside it
    const twice = runQuery(reg, people, { groupBy: [f.area.id, f.state.id] }, env(reg));
    expect(twice.groups?.map((g) => g.keys)).toEqual([["HW", "Alumno"], ["SW", "In trial"], ["SW", "Active Member"], ["", "Waiting"]]);
    expect(grouped.total).toBe(4);
    expect(grouped.records.map((r) => r.id)).toEqual([10, 11]);
  });

  it("sum up a field over every record that matches, before paging", () => {
    const result = runQuery(reg, people, {
      limit: 1,
      aggregates: [
        { field: f.rating.id, fn: "sum" }, { field: f.rating.id, fn: "avg" }, { field: f.roles.id, fn: "count" }, { field: f.roles.id, fn: "empty" },
        { field: f.privacy.id, fn: "checked" }, { field: f.state.id, fn: "unique" }, { field: f.surname.id, fn: "min" }, { field: f.rating.id, fn: "max" },
      ],
    }, env(reg));
    expect(result.records).toHaveLength(1);
    expect(result.aggregates?.map((a) => a.value)).toEqual([14, 3.5, 2, 2, 1, 4, "Bianchi", 7]);
  });

  it("drop the conditions on a deleted field", () => {
    const filter: Filter = { join: "and", items: [{ field: 1, op: "empty" }, { join: "or", items: [{ field: 2, op: "empty" }, { field: 3, op: "empty" }] }] };
    expect(dropFields(filter, [2])).toEqual({ join: "and", items: [{ field: 1, op: "empty" }, { join: "or", items: [{ field: 3, op: "empty" }] }] });
  });
});

describe("the where of NocoDB", () => {
  const { snapshot, f, PEOPLE } = teamRegistry();
  const reg = openRegistry(snapshot);
  const fieldOf = (name: string) => reg.findField(PEOPLE, name)?.id;

  it("reads conditions, lists, AND before OR and nested groups", () => {
    expect(parseWhere("(State,anyof,In trial,Active Member)~and(Area,eq,SW)", fieldOf)).toEqual({
      join: "and",
      items: [{ field: f.state.id, op: "anyOf", value: ["In trial", "Active Member"] }, { field: f.area.id, op: "eq", value: "SW" }],
    });
    const mixed = parseWhere("(State,eq,Waiting)~or(State,eq,Project)~and(Roles,blank)", fieldOf);
    expect(mixed).toEqual({
      join: "or",
      items: [{ field: f.state.id, op: "eq", value: "Waiting" }, { join: "and", items: [{ field: f.state.id, op: "eq", value: "Project" }, { field: f.roles.id, op: "empty" }] }],
    });
    expect(parseWhere("((State,eq,a)~or(State,eq,b))~and(Name,like,%an%)", fieldOf).items[1]).toEqual({ field: f.name.id, op: "contains", value: "an" });
    expect(parseWhere("(Name,like,An%)", fieldOf).items[0]).toEqual({ field: f.name.id, op: "startsWith", value: "An" });
    expect(parseWhere("(Determination,btw,5,8)", fieldOf)).toEqual({ join: "and", items: [{ field: f.determination.id, op: "gte", value: "5" }, { field: f.determination.id, op: "lte", value: "8" }] });
    expect(parseWhere("", fieldOf)).toEqual({ join: "and", items: [] });
  });

  it("refuses unknown fields and operators", () => {
    expect(() => parseWhere("(Nope,eq,1)", fieldOf)).toThrow('There is no field called "Nope"');
    expect(() => parseWhere("(State,around,1)", fieldOf)).toThrow('Unknown operator "around"');
    expect(() => parseWhere("(State,eq,1", fieldOf)).toThrow("not closed");
  });
});

describe("permissions", () => {
  const { snapshot, f, PEOPLE, CERTS } = teamRegistry();
  const withRules = (rules: typeof snapshot.tables[number]["access"], tableId = PEOPLE) => ({
    ...snapshot,
    tables: snapshot.tables.map((t) => (t.id === tableId ? { ...t, access: rules } : t)),
  });

  it("find the person by the email field and their groups by the group views", () => {
    const reg = openRegistry(snapshot);
    expect(personOf(reg, "ANNA.bianchi@team.test")).toBe(10);
    expect(personOf(reg, "nobody@team.test")).toBeNull();
    expect(groupsOf(reg, 10)).toEqual([1, 2]);
    expect(groupsOf(reg, 12)).toEqual([3]);
    expect(viewerFor(reg, { id: 5, email: "luca.verdi@team.test", isAdmin: false })).toEqual({ userId: 5, email: "luca.verdi@team.test", isAdmin: false, personId: 11, groups: [1] });
  });

  it("without rules only the admins see a table; the admins always manage everything", () => {
    const reg = openRegistry(snapshot);
    const table = reg.table(PEOPLE)!;
    const luca = viewerFor(reg, { id: 5, email: "luca.verdi@team.test", isAdmin: false });
    expect(canSeeTable(reg, table, luca)).toBe(false);
    expect(tablePermission(reg, table, luca).level).toBeNull();
    const admin = viewerFor(reg, { id: 1, email: "admin@team.test", isAdmin: true });
    const p = tablePermission(reg, table, admin);
    expect(p.level).toBe("manage");
    expect(p.writable.has(f.fullName.id)).toBe(false); // a formula is never written
    expect(p.writable.has(f.name.id)).toBe(true);
  });

  it("rules add up: the highest level, a field visible if one rule shows it, writable if one edit rule allows it", () => {
    const reg = openRegistry(withRules([
      { who: { kind: "everyone" }, level: "read", hidden: [f.cf.id, f.phone.id] },
      { who: { kind: "group", groupId: 3 }, level: "edit", hidden: [f.cf.id], readOnly: [f.name.id] },
    ]));
    const table = reg.table(PEOPLE)!;
    const member = tablePermission(reg, table, viewerFor(reg, { id: 5, email: "luca.verdi@team.test", isAdmin: false }));
    expect(member.level).toBe("read");
    expect(member.visible.has(f.cf.id)).toBe(false);
    expect(member.visible.has(f.phone.id)).toBe(false);
    expect(member.writable.size).toBe(0);
    const hr = tablePermission(reg, table, viewerFor(reg, { id: 6, email: "sara.neri@team.test", isAdmin: false }));
    expect(hr.level).toBe("edit");
    expect(hr.visible.has(f.phone.id)).toBe(true);
    expect(hr.visible.has(f.cf.id)).toBe(false);
    expect(hr.writable.has(f.state.id)).toBe(true);
    expect(hr.writable.has(f.name.id)).toBe(false);
  });

  it("a rule on one's own records holds only for them, in the people table and through a link", () => {
    const reg = openRegistry(withRules([{ who: { kind: "self" }, level: "edit", readOnly: [f.state.id] }]));
    const luca = viewerFor(reg, { id: 5, email: "luca.verdi@team.test", isAdmin: false });
    const table = reg.table(PEOPLE)!;
    expect(canSeeTable(reg, table, luca)).toBe(true);
    expect(tablePermission(reg, table, luca).level).toBeNull();
    expect(recordPermission(reg, table, reg.record(11)!, luca).level).toBe("edit");
    expect(recordPermission(reg, table, reg.record(11)!, luca).writable.has(f.state.id)).toBe(false);
    expect(recordPermission(reg, table, reg.record(10)!, luca).level).toBeNull();

    const certs = openRegistry(withRules([{ who: { kind: "self", linkFieldId: f.member.id }, level: "manage" }], CERTS));
    const anna = viewerFor(certs, { id: 7, email: "anna.bianchi@team.test", isAdmin: false });
    const certTable = certs.table(CERTS)!;
    // "manage" on one's own records is only "edit": the table itself is not theirs
    expect(recordPermission(certs, certTable, certs.record(20)!, anna).level).toBe("edit");
    expect(recordPermission(certs, certTable, certs.record(20)!, viewerFor(certs, { id: 5, email: "luca.verdi@team.test", isAdmin: false })).level).toBeNull();
  });
});

describe("forms", () => {
  const { snapshot, f, PEOPLE } = teamRegistry();
  const reg = openRegistry(snapshot);
  const table = reg.table(PEOPLE)!;
  const anonymous = { viewer: { userId: null, email: null, isAdmin: false, personId: null, groups: [] }, today: "2026-11-21", now: "2026-11-21T09:30:00.000Z" };
  const application: FormConfig = {
    access: { kind: "public" },
    mode: "create",
    fields: [{ fieldId: f.name.id, required: true }, { fieldId: f.surname.id }, { fieldId: f.uniEmail.id, required: true }, { fieldId: f.privacy.id, required: true }, { fieldId: f.area.id }],
    set: [{ fieldId: f.state.id, value: "Waiting" }, { fieldId: f.entry.id, value: "today" }],
  };

  it("an application: answers cleaned, values set by the form, links kept as ids", () => {
    const plan = planSubmission(snapshot, table, application, { [f.name.id]: "giulia", [f.surname.id]: "rosa", [f.uniEmail.id]: "Giulia.Rosa@uni.test", [f.privacy.id]: true, [f.area.id]: [1], [f.cf.id]: "not asked" }, null, anonymous);
    expect(plan).toEqual({ ok: true, changes: { [f.name.id]: "Giulia", [f.surname.id]: "Rosa", [f.uniEmail.id]: "giulia.rosa@uni.test", [f.privacy.id]: true, [f.area.id]: [1], [f.state.id]: "Waiting", [f.entry.id]: "2026-11-21" } });
  });

  it("says every problem at once: missing answers, an unchecked box that must be checked, a bad email", () => {
    const plan = planSubmission(snapshot, table, application, { [f.uniEmail.id]: "nope" }, null, anonymous);
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.errors.map((e) => e.message)).toEqual(["University Email: not a valid email address", "Name is required", "Privacy is required"]);
  });

  it("a question shown only if an earlier answer matches; its answer is dropped otherwise", () => {
    const form: FormConfig = { ...application, fields: [...application.fields, { fieldId: f.phone.id, showIf: { join: "and", items: [{ field: f.area.id, op: "anyOf", value: ["SW"] }] } }] };
    const answers = { [f.name.id]: "Ada", [f.uniEmail.id]: "ada@uni.test", [f.privacy.id]: true, [f.phone.id]: "333 1112222" };
    const without = planSubmission(snapshot, table, form, { ...answers, [f.area.id]: [2] }, null, anonymous);
    expect(without.ok && f.phone.id in without.changes).toBe(false);
    const withIt = planSubmission(snapshot, table, form, { ...answers, [f.area.id]: [1] }, null, anonymous);
    expect(withIt.ok && withIt.changes[f.phone.id]).toBe("+393331112222");
  });

  it("an update sets a value only when its condition holds on the answers (passed or rejected)", () => {
    const passed = field(PEOPLE, "Interview Passed", "checkbox");
    const snap = { ...snapshot, fields: [...snapshot.fields, passed] };
    const scouting: FormConfig = {
      access: { kind: "group", groupId: 3 },
      mode: "update",
      target: "pick",
      fields: [{ fieldId: passed.id }, { fieldId: f.determination.id, required: true }],
      set: [
        { fieldId: f.state.id, value: "Project", when: { join: "and", items: [{ field: passed.id, op: "checked" }] } },
        { fieldId: f.state.id, value: "Rejected", when: { join: "and", items: [{ field: passed.id, op: "notChecked" }] } },
      ],
    };
    const marco = snap.records.find((r) => r.id === 13)!;
    const yes = planSubmission(snap, table, scouting, { [passed.id]: true, [f.determination.id]: 7 }, marco, anonymous);
    expect(yes.ok && yes.changes[f.state.id]).toBe("Project");
    const no = planSubmission(snap, table, scouting, { [passed.id]: false, [f.determination.id]: 7 }, marco, anonymous);
    expect(no.ok && no.changes[f.state.id]).toBe("Rejected");
  });

  it("@me links the record to the person filling the form in", () => {
    const certTable = reg.table(3)!;
    const form: FormConfig = { access: { kind: "members" }, mode: "create", fields: [{ fieldId: f.certDate.id, required: true }], set: [{ fieldId: f.member.id, value: "@me" }] };
    const luca = { ...anonymous, viewer: { userId: 5, email: "luca.verdi@team.test", isAdmin: false, personId: 11, groups: [1] } };
    expect(planSubmission(snapshot, certTable, form, { [f.certDate.id]: "2026-11-01" }, null, luca)).toEqual({ ok: true, changes: { [f.certDate.id]: "2026-11-01", [f.member.id]: [11] } });
  });

  it("opens and closes on the days given", () => {
    expect(formClosedReason({ ...application, opensOn: "2026-12-01" }, "2026-11-21")).toBe("This form opens on 2026-12-01");
    expect(formClosedReason({ ...application, closesOn: "2026-11-20" }, "2026-11-21")).toBe("This form is closed");
    expect(formClosedReason({ ...application, opensOn: "2026-11-21", closesOn: "2026-11-21" }, "2026-11-21")).toBeNull();
  });
});

describe("field definitions", () => {
  const { snapshot, f, PEOPLE } = teamRegistry();
  it("refuse duplicate names, impossible options, broken formulas and loops", () => {
    expect(fieldProblem(snapshot, { ...f.surname, name: "name" })).toBe('There is already a field called "name"');
    expect(fieldProblem(snapshot, field(PEOPLE, "Pick", "select", { choices: [{ name: "a" }, { name: "A" }] }))).toBe("Two choices have the same name");
    expect(fieldProblem(snapshot, field(PEOPLE, "Pick", "select", { choices: [] }))).toBe("Add at least one choice");
    expect(fieldProblem(snapshot, field(PEOPLE, "Bad", "formula", { expression: "CONCAT(" }))).toContain("Formula:");
    expect(fieldProblem(snapshot, field(PEOPLE, "Bad", "formula", { expression: "{#99999}" }))).toBe('Formula: there is no field "#99999"');
    expect(fieldProblem(snapshot, field(PEOPLE, "L", "lookup", { linkFieldId: f.name.id, fieldId: f.tag.id }))).toBe("Choose a link field of this table");
    expect(fieldProblem(snapshot, field(PEOPLE, "L", "lookup", { linkFieldId: f.area.id, fieldId: f.name.id }))).toBe("Choose a field of the linked table");
    expect(fieldProblem(snapshot, field(PEOPLE, "U", "longtext", {}, { unique: true }))).toContain("cannot be unique");
    expect(fieldProblem(snapshot, f.fullName)).toBeNull();
    expect(fieldProblem(snapshot, f.areaTag)).toBeNull();

    const a = field(PEOPLE, "A", "formula");
    const b = field(PEOPLE, "B", "formula", { expression: `{#${a.id}} + 1` });
    a.options.expression = `{#${b.id}} + 1`;
    expect(fieldProblem({ ...snapshot, fields: [...snapshot.fields, b] }, a)).toBe("Formula: it ends up using itself");
  });
});

describe("CSV", () => {
  it("round-trips quotes, commas and line breaks, and keeps formula-looking texts as texts", () => {
    const rows = [["Name", "Note"], ["Anna", 'says "hi", twice'], ["Luca", "two\nlines"], ["=1+1", "-5"]];
    const text = toCsv(rows);
    expect(text).toBe('Name,Note\r\nAnna,"says ""hi"", twice"\r\nLuca,"two\nlines"\r\n\'=1+1,-5');
    expect(parseCsv(text)).toEqual([["Name", "Note"], ["Anna", 'says "hi", twice'], ["Luca", "two\nlines"], ["'=1+1", "-5"]]);
    expect(parseCsv("﻿a,b\n1,2\n\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
});
