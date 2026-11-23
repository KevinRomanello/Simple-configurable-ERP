import { describe, expect, it } from "vitest";
import { fieldProblem } from "./checks";
import { openRegistry } from "./compute";
import { matches, periodOf, resolveDay } from "./filter";
import { validationError } from "./form";
import { evaluateFormula, parseFormula, type FormulaValue } from "./formula";
import { md5, sha256, sha512 } from "./hash";
import { aggregate, recordColor, runQuery } from "./query";
import { checkTemplate, renderTemplate, TemplateError } from "./template";
import { field, record, table, teamRegistry } from "./testing";
import type { Filter, RegistrySnapshot } from "./types";
import { defaultOf, formatDuration, normalizeValue } from "./values";
import { parseWhere } from "./where";

// What NocoDB offers and the registry must do the same way: the samples of NocoDB's documentation
// (nocodb.com/docs, formulas, filters, fields), checked one by one.

const env = { today: "2026-11-21", now: "2026-11-21T09:30:00.000Z", recordId: 42, createdAt: "2026-11-06T14:30:00.000Z" };
const run = (src: string, refs: Record<string, FormulaValue> = {}) => evaluateFormula(parseFormula(src), (r) => refs[r] ?? null, env);

describe("formulas as in NocoDB", () => {
  it("numeric functions", () => {
    expect(run("ADD(-10, 15, 20)")).toBe(25);
    expect(run('COUNT(1, 2, "abc", 3)')).toBe(3);
    expect(run('COUNTA(1, "", "text")')).toBe(2);
    expect(run('COUNTALL(1, "", "text")')).toBe(3);
    expect([run("EVEN(7)"), run("EVEN(-5)"), run("ODD(6)"), run("ODD(-5.5)")]).toEqual([8, -6, 7, -7]);
    expect(run("EXP(2)")).toBeCloseTo(7.38905609893065, 12);
    expect([run("INT(8.75)"), run("INT(-15.25)")]).toEqual([8, -15]);
    expect([run("LOG(10, 100)"), run("LOG(2, 8)")]).toEqual([2, 3]);
    expect(run("MOD(-15, 4)")).toBe(-3);
    expect([run("POWER(2, 3)"), run("POWER(10, -2)")]).toEqual([8, 0.01]);
    expect([run("ROUND(8.765, 2)"), run("ROUND(-15.123, 1)")]).toEqual([8.77, -15.1]);
    expect([run("ROUNDDOWN(8.765, 2)"), run("ROUNDDOWN(-15.123, 1)")]).toEqual([8.76, -15.2]);
    expect([run("ROUNDUP(8.765, 2)"), run("ROUNDUP(-15.123, 1)")]).toEqual([8.77, -15.1]);
    expect(run("SQRT(25)")).toBe(5);
    expect(run("SQRT(-1)")).toBeNull();
    expect([run('VALUE("123$")'), run('VALUE("USD -45.67")')]).toEqual([123, -45.67]);
  });

  it("text functions", () => {
    expect(run('FIND("WORLD", "HELLO WORLD")')).toBe(7);
    // positions count from 1, as SUBSTR in the same page (its MID sample counts from 0: a slip of the page)
    expect(run("MID('This is a sentence', 6, 3)")).toBe("is ");
    expect(run("REGEX_EXTRACT('Error: Something went wrong', 'Error: (.*)')")).toBe("Something went wrong");
    expect(run("REGEX_MATCH('123-45-6789', '\\d{3}-\\d{2}-\\d{4}')")).toBe(1);
    expect(run("REGEX_REPLACE('Replace all bugs', 'bug', 'feature')")).toBe("Replace all features");
    expect(run("REGEX_MATCH('x', '(')")).toBeNull();
    expect(run("REPEAT('ab', 3)")).toBe("ababab");
    expect(run("REPLACE('Replace old text', 'old', 'new')")).toBe("Replace new text");
    expect(run("SEARCH('user@example.com', '@')")).toBe(5);
    expect([run('SUBSTITUTE("a-b-c", "-", "+")'), run('SUBSTITUTE("a-b-c", "-", "+", 2)')]).toEqual(["a+b+c", "a-b+c"]);
    expect(run("SUBSTR('Extract this text', 9, 4)")).toBe("this");
    expect([run('TEXTAFTER("john@example.com", "@")'), run('TEXTAFTER("a/b/c", "/", -1)')]).toEqual(["example.com", "c"]);
    expect([run('TEXTBEFORE("john@example.com", "@")'), run('TEXTBEFORE("a/b/c", "/", -1)')]).toEqual(["john", "a/b"]);
    expect(run('TEXTBEFORE("abc", "@")')).toBeNull();
    expect(run('TEXTSPLIT("a,b,,c", ",", TRUE())')).toEqual(["a", "b", "c"]);
    expect(run("'https://example.com/q?param=' & URLENCODE('Hello, world')")).toBe("https://example.com/q?param=Hello%2C%20world");
    expect(run("MD5('nocodb')")).toBe("d867ba3554696af54e71a5b42ccd4947");
    expect([run("ISNOTBLANK('')"), run("ISNOTBLANK('Hello')")]).toEqual([false, true]);
  });

  it("dates and moments, in UTC", () => {
    expect(run('DATETIME_DIFF("2022/10/14", "2022/10/15", "seconds")')).toBe(-86400);
    expect(run('DATETIME_DIFF("2026-03-31", "2026-01-31", "M")')).toBe(2);
    expect(run('DATETIME_DIFF("2026-01-01 10:30", "2026-01-01 10:00", "m")')).toBe(30);
    expect(run("DATEADD('2022-03-14 10:00:00', 30, 'second')")).toBe("2022-03-14T10:00:30.000Z");
    expect(run("DATEADD('2022-03-14', 1, 'week')")).toBe("2022-03-21");
    expect(run("DATEADD('2026-01-31', 1, 'month')")).toBe("2026-02-28");
    expect(run('WEEKNUM("2021-01-01")')).toBe(1);
    expect(run('WEEKNUM("2021-01-03")')).toBe(2);
    expect(run('WEEKNUM("2021-06-09")')).toBe(24);
    expect(run('WEEKNUM("2021-01-03", "monday")')).toBe(1);
    expect(run("DATESTR('2022-03-14 12:00:00')")).toBe("2022-03-14");
    expect(run("DATETIME_FORMAT('2018-08-16 20:02')")).toBe("2018-08-16 20:02");
    expect(run("DATETIME_FORMAT('2018-08-16 20:02', \"DD MMM YYYY\")")).toBe("16 Aug 2018");
    expect(run("DATETIME_FORMAT('2018-08-16 20:02', \"hh:mm A\")")).toBe("08:02 PM");
    expect(run("DATETIME_FORMAT('2018-08-16 20:02', \"dddd\")")).toBe("Thursday");
    expect(run("DATETIME_FORMAT('2018-08-16 20:02', \"LLL\")")).toBe("August 16, 2018 8:02 PM");
    expect(run("DATETIME_FORMAT('2018-08-16 20:02', \"[Year:] YYYY\")")).toBe("Year: 2018");
    expect(run("DATETIME_PARSE('16/08/2018', 'DD/MM/YYYY')")).toBe("2018-08-16");
    expect(run("DATETIME_PARSE('16/08/2018 8:02 PM', 'DD/MM/YYYY h:mm A')")).toBe("2018-08-16T20:02:00.000Z");
    expect(run("DATETIME_PARSE('31/02/2018', 'DD/MM/YYYY')")).toBeNull();
    expect([run("HOUR('2022-03-14 12:00:00')"), run('MINUTE("2026-11-06 14:30:45")'), run('SECOND("2026-11-06 14:30:45")')]).toEqual([12, 30, 45]);
    expect(run('WORKDAY("2026-12-18", 10)')).toBe("2027-01-01");
    expect(run('WORKDAY("2026-12-18", 10, "2026-12-25, 2027-01-01")')).toBe("2027-01-05");
    expect(run('WORKDAY_DIFF("2026-12-18", "2027-01-05")')).toBe(13);
    expect(run('WORKDAY_DIFF("2026-12-18", "2027-01-05", "2026-12-25, 2027-01-01")')).toBe(11);
    expect(run('IS_SAME("2026-01-15", "2026-01-31", "month")')).toBe(true);
    expect(run('IS_BEFORE("2026-01-01", "2026-01-31")')).toBe(true);
    expect(run('IS_AFTER("2026-02-01", "2026-01-31")')).toBe(true);
    expect(run('FROMNOW("2026-11-11")')).toBe(10);
    expect(run("CREATED_TIME()")).toBe("2026-11-06T14:30:00.000Z");
  });

  it("lists, JSON, the record and ==", () => {
    const tags: FormulaValue = ["b", "a", "", "b", "c"];
    expect(run('ARRAYSORT({T}, "desc")', { T: tags })).toEqual(["c", "b", "b", "a"]);
    expect(run("ARRAYUNIQUE({T})", { T: tags })).toEqual(["b", "a", "", "c"]);
    expect(run("ARRAYCOMPACT({T})", { T: tags })).toEqual(["b", "a", "b", "c"]);
    expect(run("ARRAYSLICE({T}, 2, 3)", { T: tags })).toEqual(["a", ""]);
    expect(run("ARRAYSLICE({T}, 3, 2)", { T: tags })).toBeNull();
    expect(run("ARRAYFLATTEN({T}, {U})", { T: ["a"], U: ["b", "c"] })).toEqual(["a", "b", "c"]);
    expect(run("JSON_EXTRACT('{\"a\": {\"b\": \"c\"}}', '.a.b')")).toBe("c");
    expect(run("JSON_EXTRACT('not json', '.a')")).toBeNull();
    expect(run("RECORD_ID()")).toBe(42);
    expect(run("1 == 1")).toBe(true);
  });

  it("hashes of known texts", () => {
    expect(md5("")).toBe("d41d8cd98f00b204e9800998ecf8427e");
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha512("abc")).toBe("ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f");
    // more than one block, and letters outside ASCII
    expect(sha256("é".repeat(40))).toHaveLength(64);
    expect(md5("The quick brown fox jumps over the lazy dog")).toBe("9e107d9d372bb6826bd81d3542a419d6");
  });
});

describe("the where of NocoDB", () => {
  const { snapshot, f } = teamRegistry();
  const reg = openRegistry(snapshot);
  const byName = (n: string) => reg.fieldsOf(2).find((x) => x.name === n)?.id;
  const typeOf = (id: number) => reg.field(id)?.type;
  const where = (w: string) => parseWhere(w, byName, typeOf);

  it("reads quotes, ~not, nallof, nbtw, is and the v2 @", () => {
    expect(where('("Full Name", eq, "Bianchi, Anna")')).toEqual({ join: "and", items: [{ field: f.fullName.id, op: "eq", value: "Bianchi, Anna" }] });
    expect(where("(Name,eq,Rossi, Mario)").items[0]).toEqual({ field: f.name.id, op: "eq", value: "Rossi, Mario" });
    expect(where("~not(Name,eq,Anna)")).toEqual({ join: "and", items: [{ field: f.name.id, op: "eq", value: "Anna" }], not: true });
    expect(where("(Name,eq,Anna)~and~not(Surname,eq,Bianchi)").items[1]).toEqual({ join: "and", items: [{ field: f.surname.id, op: "eq", value: "Bianchi" }], not: true });
    expect(where("(State,nallof,Waiting,Project)").items[0]).toEqual({ field: f.state.id, op: "notAllOf", value: ["Waiting", "Project"] });
    const rating = byName("Interview Rating");
    expect(where("(Interview Rating,nbtw,3,8)")).toEqual({ join: "or", items: [{ field: rating, op: "lt", value: "3" }, { field: rating, op: "gt", value: "8" }] });
    expect(where("(Name,is,null)").items[0]).toEqual({ field: f.name.id, op: "empty" });
    expect(where('@("Name", notblank)').items[0]).toEqual({ field: f.name.id, op: "notEmpty" });
  });

  it("reads the sub-operators of dates, only on dates", () => {
    const entry = f.entry.id;
    expect(where("(Entry Date,eq,today)").items[0]).toEqual({ field: entry, op: "eq", value: "today" });
    expect(where("(Entry Date,lt,daysAgo,10)").items[0]).toEqual({ field: entry, op: "lt", value: "today-10" });
    expect(where("(Entry Date,gt,oneMonthAgo)").items[0]).toEqual({ field: entry, op: "gt", value: "today-1m" });
    expect(where("(Entry Date,eq,exactDate,2026-01-15)").items[0]).toEqual({ field: entry, op: "eq", value: "2026-01-15" });
    expect(where("(Entry Date,isWithin,nextNumberOfDays,7)").items[0]).toEqual({ field: entry, op: "within", value: ["nextNumberOfDays", 7] });
    // a text field keeps the word
    expect(where("(Name,eq,yesterday)").items[0]).toEqual({ field: f.name.id, op: "eq", value: "yesterday" });
    expect(() => where("(Entry Date,isWithin,someday)")).toThrow(/Unknown period/);
  });

  it("works out days and periods from today", () => {
    expect(resolveDay("today-1m", "2026-03-31")).toBe("2026-02-28");
    expect(resolveDay("today+1y", "2026-11-21")).toBe("2027-11-21");
    expect(periodOf("pastWeek", "2026-11-21")).toEqual(["2026-11-14", "2026-11-21"]);
    expect(periodOf("thisCalendarMonth", "2026-11-21")).toEqual(["2026-11-01", "2026-11-30"]);
    expect(periodOf("lastCalendarWeek", "2026-11-21")).toEqual(["2026-11-09", "2026-11-15"]);
    expect(periodOf(["dateRange", "2026-06-01", "2026-06-30"], "2026-11-21")).toEqual(["2026-06-01", "2026-06-30"]);
  });

  it("filters with within, notAllOf and a negated group", () => {
    const people = reg.recordsOf(2);
    const ids = (filter: Filter) => people.filter((r) => matches(reg, r, filter, { today: "2026-11-21" })).map((r) => r.id);
    const created = field(2, "Joined", "created");
    const reg2 = openRegistry({ ...snapshot, fields: [...snapshot.fields, created] });
    expect(people.filter((r) => matches(reg2, r, { join: "and", items: [{ field: created.id, op: "within", value: "thisCalendarMonth" }] }, { today: "2026-11-21" })).length).toBe(people.length);
    expect(ids({ join: "and", items: [{ field: f.state.id, op: "notAllOf", value: ["Waiting"] }] })).toEqual(ids({ join: "and", items: [{ field: f.state.id, op: "neq", value: "Waiting" }] }));
    const anna = { join: "and" as const, items: [{ field: f.name.id, op: "eq" as const, value: "Anna" }] };
    expect(ids({ ...anna, not: true })).toEqual(people.map((r) => r.id).filter((id) => !ids(anna).includes(id)));
  });
});

describe("the field types of NocoDB", () => {
  const n = (type: Parameters<typeof field>[2], raw: unknown, options = {}) => normalizeValue(field(9, "F", type, options), raw);

  it("time, duration, coordinates, colour, user", () => {
    expect(n("time", "9:05")).toEqual({ ok: true, value: "09:05:00" });
    expect(n("time", "2:30 pm")).toEqual({ ok: true, value: "14:30:00" });
    expect(n("time", "25:00").ok).toBe(false);
    expect(n("duration", "1:30")).toEqual({ ok: true, value: 5400 });
    expect(n("duration", "120:15:30.5")).toEqual({ ok: true, value: 432930.5 });
    expect(n("duration", 90)).toEqual({ ok: true, value: 90 });
    expect(n("duration", "1:75").ok).toBe(false);
    expect([formatDuration(5400), formatDuration(5430, "h:mm:ss"), formatDuration(5.5, "h:mm:ss.s")]).toEqual(["1:30", "1:30:30", "0:00:05.5"]);
    expect(n("geodata", "46.0664; 11.1257")).toEqual({ ok: true, value: "46.0664;11.1257" });
    expect(n("geodata", { lat: 46, lng: 11 })).toEqual({ ok: true, value: "46;11" });
    expect(n("geodata", "95;11").ok).toBe(false);
    expect(n("color", "ff5733")).toEqual({ ok: true, value: "#FF5733" });
    expect(n("color", "#abc")).toEqual({ ok: true, value: "#AABBCC" });
    expect(n("color", "red").ok).toBe(false);
    expect(n("user", [3, 3])).toEqual({ ok: true, value: [3] });
    expect(n("user", [3, 4]).ok).toBe(false);
    expect(n("user", [3, 4], { multiple: true })).toEqual({ ok: true, value: [3, 4] });
    expect(n("uuid", "x").ok).toBe(false);
  });

  it("users show by name and filter by @me", () => {
    const { snapshot } = teamRegistry();
    const owner = field(2, "Owner", "user");
    const reg = openRegistry({ ...snapshot, fields: [...snapshot.fields, owner], records: snapshot.records.map((r) => (r.id === 10 ? { ...r, data: { ...r.data, [owner.id]: [1] } } : r)) });
    expect(reg.output(reg.record(10)!, owner)).toEqual([{ id: 1, name: "Admin Person" }]);
    const mine = { join: "and" as const, items: [{ field: owner.id, op: "eq" as const, value: "@me" }] };
    expect(reg.recordsOf(2).filter((r) => matches(reg, r, mine, { today: "2026-11-21", me: { email: null, personId: null, userId: 1 } })).map((r) => r.id)).toEqual([10]);
  });

  it("default values: fixed or dynamic, never with unique", () => {
    const ctx = { today: "2026-11-21", now: "2026-11-21T09:30:00.000Z", userId: 7, email: "me@team.test" };
    expect(defaultOf(field(9, "D", "date", { default: "today" }), ctx)).toBe("2026-11-21");
    expect(defaultOf(field(9, "D", "datetime", { default: "now" }), ctx)).toBe("2026-11-21T09:30:00.000Z");
    expect(defaultOf(field(9, "U", "user", { default: "@me" }), ctx)).toEqual([7]);
    expect(defaultOf(field(9, "S", "select", { default: "Waiting" }), ctx)).toBe("Waiting");
    const empty: RegistrySnapshot = { tables: [table(9, "T")], fields: [], views: [], records: [], links: [], files: [], users: [], settings: { peopleTableId: null, emailFieldId: null }, today: "2026-11-21", now: ctx.now };
    expect(fieldProblem(empty, field(9, "S", "select", { choices: [{ name: "A" }], default: "B" }))).toMatch(/Default value/);
    expect(fieldProblem(empty, field(9, "N", "number", { default: "today" }))).toMatch(/today is a default for dates/);
    expect(fieldProblem(empty, field(9, "E", "email", { default: "a@b.test" }, { unique: true }))).toMatch(/unique field cannot have a default/);
    expect(fieldProblem(empty, field(9, "L", "link", { tableId: 9, default: [1] }))).toMatch(/has no default/);
  });
});

describe("summaries, rollups and colours", () => {
  const { snapshot, f } = teamRegistry();
  const reg = openRegistry(snapshot);
  const people = reg.recordsOf(2);

  it("the footer of the grid", () => {
    expect(aggregate(reg, people, f.rating, "percentFilled")).toBeGreaterThan(0);
    const values = people.map((r) => reg.value(r, f.rating)).filter((v): v is number => typeof v === "number").sort((a, b) => a - b);
    expect(aggregate(reg, people, f.rating, "range")).toBe(values[values.length - 1]! - values[0]!);
    expect(aggregate(reg, people, f.rating, "median")).not.toBeNull();
    expect(aggregate(reg, people, f.rating, "stddev")).toBeGreaterThanOrEqual(0);
  });

  it("distinct rollups", () => {
    const tagRollup = (fn: "countDistinct" | "countValues") => field(1, `Tags ${fn}`, "rollup", { linkFieldId: f.areaPeople.id, fieldId: f.state.id, fn });
    const distinct = tagRollup("countDistinct");
    const all = tagRollup("countValues");
    const reg2 = openRegistry({ ...snapshot, fields: [...snapshot.fields, distinct, all] });
    const sw = reg2.record(1)!;
    expect(reg2.value(sw, distinct)).toBeLessThanOrEqual(reg2.value(sw, all) as number);
  });

  it("the colour of a record", () => {
    const anna = reg.record(10)!;
    const rule = { filter: { join: "and" as const, items: [{ field: f.name.id, op: "eq" as const, value: "Anna" }] }, color: "#E8F0FE" };
    expect(recordColor(reg, anna, { colors: [rule] }, { today: "2026-11-21" })).toBe("#E8F0FE");
    expect(recordColor(reg, reg.record(11)!, { colors: [rule] }, { today: "2026-11-21" })).toBeNull();
  });
});

describe("forms and webhook bodies", () => {
  it("checks the answers of a question", () => {
    const text = field(9, "Matricola", "text");
    const q = { fieldId: text.id, validate: { minLength: 6, pattern: "^\\d+$" } };
    expect(validationError(q, text, "123", "2026-11-21")).toBe("Matricola: at least 6 characters");
    expect(validationError(q, text, "12345a", "2026-11-21")).toBe("Matricola: not in the expected form");
    expect(validationError(q, text, "123456", "2026-11-21")).toBeNull();
    const day = field(9, "Start", "date");
    expect(validationError({ fieldId: day.id, validate: { min: "today", message: "Not in the past" } }, day, "2026-11-20", "2026-11-21")).toBe("Not in the past");
  });

  it("renders a template like Handlebars", () => {
    const event = { event: "update", record: { id: 4, fields: { Name: "Anna", Area: [{ id: 1, name: "SW" }, { id: 2, name: "HW" }], "Full Name": "Anna B" } }, previous: null };
    expect(renderTemplate('{"text": "{{record.fields.Name}} ({{event}})", "f": {{json record.fields.[Full Name]}}}', event)).toBe('{"text": "Anna (update)", "f": "Anna B"}');
    expect(renderTemplate("{{#each record.fields.Area}}{{this.name}}{{#unless @last}}, {{/unless}}{{/each}}", event)).toBe("SW, HW");
    expect(renderTemplate("{{#if previous}}changed{{else}}new{{/if}}", event)).toBe("new");
    expect(renderTemplate("{{json missing}}", event)).toBe("null");
    expect(() => checkTemplate("{{#if x}}open")).toThrow(TemplateError);
    expect(() => checkTemplate("{{/each}}")).toThrow(TemplateError);
  });
});

describe("codes, group summaries", () => {
  it("a QR code or a barcode is the text of another field", () => {
    const { snapshot, f } = teamRegistry();
    const qr = field(2, "Badge", "qrcode", { fieldId: f.fullName.id });
    const bad = field(2, "Bad", "barcode", { fieldId: 999 });
    const reg = openRegistry({ ...snapshot, fields: [...snapshot.fields, qr, bad] });
    expect(reg.value(reg.record(10)!, qr)).toBe("Anna Bianchi");
    expect(reg.value(reg.record(10)!, bad)).toBeNull();
    expect(fieldProblem(reg.snapshot, bad)).toBe("Choose the field of this table the code shows");
    expect(fieldProblem(reg.snapshot, field(2, "B2", "barcode", { fieldId: f.name.id, barcodeFormat: "NOPE" as never }))).toBe("Unknown kind of barcode");
  });

  it("each group has its own summaries", () => {
    const { snapshot, f } = teamRegistry();
    const reg = openRegistry(snapshot);
    const result = runQuery(reg, reg.recordsOf(2), { groupBy: [f.area.id], aggregates: [{ field: f.name.id, fn: "count" }] }, { today: "2026-11-21" });
    expect(result.groups?.map((g) => [g.key, g.aggregates?.[0]?.value])).toEqual(result.groups?.map((g) => [g.key, g.count]));
  });
});

void record;
