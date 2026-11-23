import type { Field, FieldOptions, FieldType, Link, RecordRow, RegistrySnapshot, Table, View } from "./types";

// A small registry shaped like the team's (areas, people, certificates), with made-up people, for the tests.

let nextField = 100;

export function field(tableId: number, name: string, type: FieldType, options: FieldOptions = {}, extra: Partial<Field> = {}): Field {
  nextField++;
  return { id: nextField, tableId, name, type, options, required: false, unique: false, description: "", position: nextField, ...extra };
}

export function table(id: number, name: string, extra: Partial<Table> = {}): Table {
  return { id, name, description: "", icon: "", section: "", position: id, primaryFieldId: null, access: [], ...extra };
}

export function record(id: number, tableId: number, data: Record<string, unknown>, extra: Partial<RecordRow> = {}): RecordRow {
  return { id, tableId, data, version: 1, createdAt: "2026-11-01T10:00:00.000Z", createdBy: 1, updatedAt: "2026-11-02T10:00:00.000Z", updatedBy: 1, ...extra };
}

/** The team-like registry: field ids are in `f`, so tests read `f.state` instead of numbers. */
export function teamRegistry() {
  const AREAS = 1;
  const PEOPLE = 2;
  const CERTS = 3;
  const tag = field(AREAS, "Tag", "text");
  const areaName = field(AREAS, "Name", "text");
  const name = field(PEOPLE, "Name", "text", { transform: "title" }, { required: true });
  const surname = field(PEOPLE, "Surname", "text", { transform: "title" });
  const fullName = field(PEOPLE, "Full Name", "formula", { expression: "" });
  const state = field(PEOPLE, "State", "select", { choices: ["Waiting", "Project", "In trial", "Active Member", "Reachable", "Alumno", "Rejected"].map((n) => ({ name: n })) });
  const uniEmail = field(PEOPLE, "University Email", "email", {}, { unique: true });
  const teamEmail = field(PEOPLE, "Team Email", "formula", { expression: "" });
  const area = field(PEOPLE, "Area", "link", { tableId: AREAS, multiple: false });
  const areaPeople = field(AREAS, "People", "link", { tableId: PEOPLE, multiple: true, inverseId: area.id });
  area.options.inverseId = areaPeople.id;
  const areaTag = field(PEOPLE, "Area Tag", "lookup", { linkFieldId: area.id, fieldId: tag.id });
  const roles = field(PEOPLE, "Roles", "multiselect", { choices: ["CT", "TL", "PM", "HR", "TR"].map((n) => ({ name: n })) });
  const determination = field(PEOPLE, "Determination", "rating", { max: 10 });
  const skills = field(PEOPLE, "Skills", "rating", { max: 10 });
  const rating = field(PEOPLE, "Interview Rating", "formula", { expression: "" });
  const phone = field(PEOPLE, "Phone", "phone", { defaultPrefix: "+39" });
  const privacy = field(PEOPLE, "Privacy", "checkbox");
  const entry = field(PEOPLE, "Entry Date", "date");
  const cf = field(PEOPLE, "CF", "text");
  const certDate = field(CERTS, "Date", "date");
  const certType = field(CERTS, "Type", "select", { choices: [{ name: "Medium" }, { name: "Fire" }] });
  const validity = field(CERTS, "Validity Days", "number");
  const expiry = field(CERTS, "Expiration", "formula", { expression: "" });
  const member = field(CERTS, "Member", "link", { tableId: PEOPLE, multiple: false });
  const certificates = field(PEOPLE, "Certificates", "link", { tableId: CERTS, multiple: true, inverseId: member.id });
  member.options.inverseId = certificates.id;
  const certCount = field(PEOPLE, "Certificates Count", "rollup", { linkFieldId: certificates.id, fn: "count" });

  fullName.options.expression = `CONCAT({#${name.id}}, " ", {#${surname.id}})`;
  teamEmail.options.expression = `CONCAT(LEFT({#${uniEmail.id}}, SEARCH({#${uniEmail.id}}, "@")), "team.test")`;
  rating.options.expression = `FLOOR(AVG({#${determination.id}}, {#${skills.id}}))`;
  expiry.options.expression = `DATEADD({#${certDate.id}}, {#${validity.id}}, "day")`;

  const f = { tag, areaName, name, surname, fullName, state, uniEmail, teamEmail, area, areaPeople, areaTag, roles, determination, skills, rating, phone, privacy, entry, cf, certDate, certType, validity, expiry, member, certificates, certCount };
  const d = (values: [Field, unknown][]) => Object.fromEntries(values.map(([k, v]) => [String(k.id), v]));

  const records: RecordRow[] = [
    record(1, AREAS, d([[tag, "SW"], [areaName, "Software"]])),
    record(2, AREAS, d([[tag, "HW"], [areaName, "Electronics"]])),
    record(10, PEOPLE, d([[name, "Anna"], [surname, "Bianchi"], [state, "Active Member"], [uniEmail, "anna.bianchi@uni.test"], [roles, ["CT"]], [determination, 8], [skills, 7], [privacy, true], [cf, "XXXANNA"]])),
    record(11, PEOPLE, d([[name, "Luca"], [surname, "Verdi"], [state, "In trial"], [uniEmail, "luca.verdi@uni.test"], [roles, []], [determination, 6], [skills, 9]])),
    record(12, PEOPLE, d([[name, "Sara"], [surname, "Neri"], [state, "Alumno"], [uniEmail, "sara.neri@uni.test"], [roles, ["HR"]]])),
    record(13, PEOPLE, d([[name, "Marco"], [surname, "Gialli"], [state, "Waiting"], [uniEmail, "marco.gialli@uni.test"]])),
    record(20, CERTS, d([[certDate, "2026-01-10"], [certType, "Medium"], [validity, 1825]])),
    record(21, CERTS, d([[certDate, "2021-03-01"], [certType, "Fire"], [validity, 1825]])),
  ];
  const links: Link[] = [
    { fieldId: area.id, recordId: 10, targetId: 1, position: 0 },
    { fieldId: area.id, recordId: 11, targetId: 1, position: 0 },
    { fieldId: area.id, recordId: 12, targetId: 2, position: 0 },
    { fieldId: member.id, recordId: 20, targetId: 10, position: 0 },
    { fieldId: member.id, recordId: 21, targetId: 10, position: 0 },
  ];
  const tables: Table[] = [
    table(AREAS, "Areas", { primaryFieldId: tag.id }),
    table(PEOPLE, "People", { primaryFieldId: fullName.id }),
    table(CERTS, "Certificates", { primaryFieldId: certType.id }),
  ];
  const views: View[] = [
    { id: 1, tableId: PEOPLE, name: "Current Members", type: "grid", position: 1, slug: null, config: { group: true, filter: { join: "and", items: [{ field: state.id, op: "anyOf", value: ["In trial", "Active Member"] }] } } },
    { id: 2, tableId: PEOPLE, name: "Core Team", type: "grid", position: 2, slug: null, config: { group: true, filter: { join: "and", items: [{ field: roles.id, op: "anyOf", value: ["CT", "TL"] }] } } },
    { id: 3, tableId: PEOPLE, name: "HR", type: "grid", position: 3, slug: null, config: { group: true, filter: { join: "and", items: [{ field: roles.id, op: "anyOf", value: ["HR"] }] } } },
  ];
  const snapshot: RegistrySnapshot = {
    tables,
    fields: Object.values(f),
    views,
    records,
    links,
    files: [],
    users: [{ id: 1, name: "Admin Person", email: "admin@team.test" }],
    settings: { peopleTableId: PEOPLE, emailFieldId: teamEmail.id },
    today: "2026-11-21",
    now: "2026-11-21T09:30:00.000Z",
  };
  return { snapshot, f, AREAS, PEOPLE, CERTS };
}
