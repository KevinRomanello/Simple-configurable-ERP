import { asc, eq, inArray, sql } from "drizzle-orm";
import { runWrite } from "../core/tx";
import { userStorage } from "../modules/auth/auth.context";
import { createRecords, listNames } from "../modules/registry/records.service";
import { createField, createTable, createView, getTable, setRegistrySettings, updateField, updateTable } from "../modules/registry/schema.service";
import { loadUser } from "../modules/users/users.service";
import { db, pool } from "./client";
import { appUser, regTable } from "./schema";

// A made-up registry shaped like the team's (docs/anagrafiche.md, §1.1), only to look at and try: areas,
// projects and workgroups, roles, people from the application to the exit, certificates with their expiry,
// groups, rules and the forms of the HR path. Nobody here is real. It goes through the services of the
// registry as the first admin, so it is in the history like any other change.
//
//   pnpm --filter @erp/api db:seed-registry             make it (refused if a table People is there)
//   pnpm --filter @erp/api db:seed-registry -- --remove take the demonstration tables away

const remove = process.argv.includes("--remove");
const DEMO_TABLES = ["Certificates", "Certificate Types", "People", "Roles", "Projects", "Areas"];

const [first] = await db.select().from(appUser).where(eq(appUser.role, "admin")).orderBy(asc(appUser.id)).limit(1);
const admin = first ? await loadUser(first.id) : null;
if (!admin) throw new Error("There is no active admin to make the registry as: sign in once first");

await userStorage.run(admin, async () => {
  const exists = async (name: string) => (await db.select({ id: regTable.id }).from(regTable).where(sql`lower(${regTable.name}) = ${name.toLowerCase()}`)).length > 0;
  if (remove) {
    // all the demonstration tables at once: they link to each other, and their fields, views, records, links
    // and files go with them (the settings of the registry let go of them by themselves: on delete set null)
    await runWrite(admin, (tx) => tx.delete(regTable).where(inArray(sql`lower(${regTable.name})`, DEMO_TABLES.map((n) => n.toLowerCase()))));
    console.log("The demonstration registry is gone.");
    return;
  }
  if (await exists("People")) throw new Error("There is already a table called People: remove the demonstration registry first (--remove)");

  const field = (table: string, body: Parameters<typeof createField>[1]) => createField(table, body);
  const rename = async (table: string, name: string) => {
    const t = await getTable(table);
    await updateField(t.fields[0]!.id, { name });
  };

  // reference tables
  await createTable({ name: "Areas", section: "HR & Recruitment", icon: "🧭", description: "The areas of the team" });
  await rename("Areas", "Tag");
  await field("Areas", { name: "Full Name", type: "text" });
  await createRecords("Areas", [
    ["MT", "Mechanics"], ["DMT", "Dynamics and Control"], ["SW", "Software"], ["HW", "Electronics"], ["CM", "Communication"], ["MGT", "Management"],
  ].map(([tag, name]) => ({ fields: { Tag: tag, "Full Name": name } })));

  await createTable({ name: "Projects", section: "HR & Recruitment", icon: "🛠️", description: "Projects and workgroups, with their PM or RP" });
  await field("Projects", { name: "Tag", type: "text" });
  await field("Projects", { name: "Kind", type: "select", options: { choices: [{ name: "Project" }, { name: "Workgroup" }] } });
  await field("Projects", { name: "Areas", type: "link", options: { tableId: "Areas", multiple: true }, inverseName: "Projects" });
  const areaIds = Object.fromEntries((await listNames("Areas")).map((a) => [a.name, a.id]));
  await createRecords("Projects", [
    ["Telemetry", "TLM", "Project", "SW"], ["Controls", "CTRL", "Project", "DMT"], ["Low Voltage", "LV", "Project", "HW"], ["Chassis", "Chassis", "Project", "MT"],
    ["Human Resources", "HR", "Project", "MGT"], ["IT & Automation", "IT", "Workgroup", "SW"], ["Sponsor", "SP", "Workgroup", "MGT"], ["Social Media", "SM", "Workgroup", "CM"],
  ].map(([name, tag, kind, area]) => ({ fields: { Name: name, Tag: tag, Kind: kind, Areas: [areaIds[area!]] } })));

  await createTable({ name: "Roles", section: "HR & Recruitment", icon: "🎖️", description: "Team and legal roles" });
  await field("Roles", { name: "Tag", type: "text" });
  await field("Roles", { name: "Kind", type: "select", options: { choices: [{ name: "Team" }, { name: "Legal" }] } });
  await createRecords("Roles", [
    ["Team Leader", "TL", "Team"], ["Core Team", "CT", "Team"], ["Treasurer", "TR", "Legal"], ["Chief Legal Officer", "CLO", "Team"], ["President", "P", "Legal"],
  ].map(([name, tag, kind]) => ({ fields: { Name: name, Tag: tag, Kind: kind } })));

  // the people, from the application to the exit
  await createTable({ name: "People", section: "HR & Recruitment", icon: "👤", description: "Everybody, from the application to the exit: made-up people" });
  await updateField((await getTable("People")).fields[0]!.id, { options: { transform: "title" } });
  await field("People", { name: "Surname", type: "text", options: { transform: "title" }, required: false });
  const full = await field("People", { name: "Full Name", type: "formula", options: { expression: 'CONCAT({Name}, " ", {Surname})' } });
  await updateTable("People", { primaryFieldId: full.id });
  await field("People", { name: "State", type: "select", options: { choices: ["Waiting", "Contacted", "Project", "In trial", "Active Member", "Reachable", "Alumno", "Rejected"].map((name) => ({ name })) } });
  await field("People", { name: "University Email", type: "email", unique: true });
  const team = await field("People", { name: "Team Email", type: "formula", options: { expression: 'CONCAT(LEFT({University Email}, SEARCH({University Email}, "@")), "eagletrt.it")' } });
  await field("People", { name: "Phone", type: "phone", options: { defaultPrefix: "+39" } });
  await field("People", { name: "Area", type: "link", options: { tableId: "Areas", multiple: false }, inverseName: "Members" });
  await field("People", { name: "Area Tag", type: "lookup", options: { linkFieldId: "Area", fieldId: "Tag" } });
  await field("People", { name: "Projects", type: "link", options: { tableId: "Projects", multiple: true }, inverseName: "People" });
  await field("People", { name: "Roles", type: "link", options: { tableId: "Roles", multiple: true }, inverseName: "People" });
  await field("People", { name: "Role Tags", type: "lookup", options: { linkFieldId: "Roles", fieldId: "Tag" } });
  await field("People", { name: "Registration Date", type: "date" });
  await field("People", { name: "Trial Start Date", type: "date" });
  await field("People", { name: "Entry Date", type: "date" });
  await field("People", { name: "Exit Date", type: "date" });
  await field("People", { name: "Determination", type: "rating", options: { max: 10 } });
  await field("People", { name: "Skills", type: "rating", options: { max: 10 } });
  await field("People", { name: "Interview Rating", type: "formula", options: { expression: "FLOOR(AVG({Determination}, {Skills}))" } });
  await field("People", { name: "Interview Passed", type: "checkbox" });
  await field("People", { name: "Scout Notes", type: "longtext" });
  await field("People", { name: "CF", type: "text", options: { transform: "upper" }, description: "Codice fiscale" });
  await field("People", { name: "Privacy Confirmation", type: "checkbox" });
  await field("People", { name: "CV", type: "attachment", options: { accept: ["application/pdf"], maxSizeMb: 5, maxFiles: 1 } });
  await field("People", { name: "Photo", type: "attachment", options: { accept: ["image/*"], maxSizeMb: 2, maxFiles: 1 } });
  await field("People", { name: "Exit Reason", type: "longtext" });

  const ids = async (table: string) => Object.fromEntries((await listNames(table)).map((r) => [r.name, r.id]));
  const areas = await ids("Areas");
  const projects = await ids("Projects");
  const roles = await ids("Roles");
  const people: [string, string, string, string, string, string[], string[]][] = [
    ["Giulia", "Ferri", "Active Member", "giulia.ferri@uni.test", "SW", ["Telemetry", "IT & Automation"], ["Core Team"]],
    ["Marco", "Rinaldi", "Active Member", "marco.rinaldi@uni.test", "MGT", ["Human Resources"], ["Treasurer"]],
    ["Elena", "Conti", "Active Member", "elena.conti@uni.test", "DMT", ["Controls"], ["Team Leader"]],
    ["Paolo", "Gatti", "In trial", "paolo.gatti@uni.test", "HW", ["Low Voltage"], []],
    ["Sofia", "Moretti", "Project", "sofia.moretti@uni.test", "MT", ["Chassis"], []],
    ["Luca", "Galli", "Waiting", "luca.galli@uni.test", "SW", ["Telemetry"], []],
    ["Chiara", "Fontana", "Reachable", "chiara.fontana@uni.test", "CM", ["Social Media"], []],
    ["Andrea", "Marino", "Alumno", "andrea.marino@uni.test", "MT", ["Chassis"], []],
  ];
  await createRecords("People", people.map(([name, surname, state, email, area, ps, rs], i) => ({
    fields: {
      Name: name, Surname: surname, State: state, "University Email": email, Area: [areas[area]], Projects: ps.map((p) => projects[p]), Roles: rs.map((r) => roles[r]),
      // the applications of this autumn, and the entry a month later for who got in
      "Registration Date": `2026-${String(9 + (i % 3)).padStart(2, "0")}-${String(3 + 3 * i).padStart(2, "0")}`,
      ...(state === "Active Member" ? { "Entry Date": `2026-${String(10 + (i % 3)).padStart(2, "0")}-${String(3 + 3 * i).padStart(2, "0")}` } : {}),
      Determination: 5 + (i % 5), Skills: 4 + (i % 6), "Interview Passed": state !== "Waiting",
    },
  })));

  // the certificates, with the expiry worked out from the type
  await createTable({ name: "Certificate Types", section: "Documents", icon: "📜" });
  await field("Certificate Types", { name: "Validity Days", type: "number" });
  await createRecords("Certificate Types", [["Medium Risk Safety Course", 1825], ["Firefighting Course", 1825], ["First Aid", 1095]].map(([name, days]) => ({ fields: { Name: name, "Validity Days": days } })));
  await createTable({ name: "Certificates", section: "Documents", icon: "🦺", description: "Safety certificates: the expiry comes from the type" });
  await rename("Certificates", "Note");
  await field("Certificates", { name: "Member", type: "link", options: { tableId: "People", multiple: false }, inverseName: "Certificates" });
  await field("Certificates", { name: "Type", type: "link", options: { tableId: "Certificate Types", multiple: false }, inverseName: "Certificates" });
  await field("Certificates", { name: "Date", type: "date" });
  await field("Certificates", { name: "Validity Days", type: "lookup", options: { linkFieldId: "Type", fieldId: "Validity Days" } });
  await field("Certificates", { name: "Expiration Date", type: "formula", options: { expression: 'DATEADD({Date}, {Validity Days}, "day")' } });
  await field("Certificates", { name: "File", type: "attachment", options: { accept: ["application/pdf", "image/*"], maxFiles: 1 } });
  const types = await ids("Certificate Types");
  const who = await ids("People");
  await createRecords("Certificates", [
    ["Giulia Ferri", "Medium Risk Safety Course", "2025-10-01"], ["Marco Rinaldi", "Firefighting Course", "2020-03-15"], ["Paolo Gatti", "First Aid", "2026-09-20"],
  ].map(([person, type, date]) => ({ fields: { Member: [who[person!]], Type: [types[type!]], Date: date } })));
  await createView("Certificates", { name: "Expired", type: "grid", config: { filter: { join: "and", items: [{ field: "Expiration Date", op: "lt", value: "today" }] } } });

  // who is who: the people table, the groups, the rules
  const peopleTable = await getTable("People");
  await setRegistrySettings({ peopleTableId: peopleTable.id, emailFieldId: team.id });
  const group = (name: string, filter: object) => createView("People", { name, type: "grid", config: { group: true, filter: filter as never } });
  const current = await group("Current Members", { join: "and", items: [{ field: "State", op: "anyOf", value: ["In trial", "Active Member"] }] });
  const board = await group("Executive Board", { join: "and", items: [{ field: "Role Tags", op: "anyOf", value: ["CT", "TL", "CLO"] }] });
  const hr = await group("HR", { join: "and", items: [{ field: "Projects", op: "anyOf", value: ["Human Resources"] }, { field: "State", op: "anyOf", value: ["In trial", "Active Member"] }] });
  await createView("People", { name: "Recruits", type: "grid", config: { filter: { join: "and", items: [{ field: "State", op: "anyOf", value: ["Waiting", "Contacted", "Project"] }] }, sorts: [{ field: "Registration Date", dir: "asc" }] } });
  await createView("People", { name: "By area", type: "grid", config: { groupBy: "Area", filter: { join: "and", items: [{ field: "State", op: "anyOf", value: ["In trial", "Active Member"] }] } } as never });
  await createView("People", { name: "Pipeline", type: "kanban", config: { groupBy: "State", hidden: ["CF", "Phone", "Scout Notes"] } as never });
  await createView("People", { name: "Applications", type: "calendar", config: { dateField: "Registration Date" } as never });
  await createView("People", { name: "Path", type: "timeline", config: { dateField: "Registration Date", endDateField: "Entry Date" } as never });
  await createView("People", { name: "Faces", type: "gallery", config: { coverField: "Photo", filter: { join: "and", items: [{ field: "State", op: "anyOf", value: ["In trial", "Active Member"] }] } } as never });
  const recruits = (await getTable("People")).views.find((v) => v.name === "Recruits")!;
  const sensitive = ["CF", "Phone", "Privacy Confirmation", "Exit Reason"];
  await updateTable("People", {
    access: [
      { who: { kind: "group", groupId: board.id }, level: "manage" },
      { who: { kind: "group", groupId: hr.id }, level: "edit", hidden: sensitive, readOnly: ["Name", "Surname", "University Email", "Area", "Roles"] },
      { who: { kind: "group", groupId: current.id }, level: "read", hidden: [...sensitive, "Scout Notes", "Determination", "Skills", "Interview Rating", "CV"] },
      { who: { kind: "self" }, level: "edit", readOnly: ["State", "Roles", "Entry Date", "Trial Start Date", "Determination", "Skills", "Interview Passed", "Scout Notes"] },
    ],
  });
  for (const table of ["Areas", "Projects", "Roles", "Certificate Types"]) await updateTable(table, { access: [{ who: { kind: "everyone" }, level: "read" }, { who: { kind: "group", groupId: board.id }, level: "manage" }] });
  await updateTable("Certificates", { access: [{ who: { kind: "group", groupId: board.id }, level: "manage" }, { who: { kind: "self", linkFieldId: "Member" }, level: "read" }] });

  // the forms of the HR path (docs/anagrafiche.md, §8.2)
  const form = (table: string, name: string, slug: string, config: object) => createView(table, { name, type: "form", slug, config: { form: config as never } });
  await form("People", "Application", "apply", {
    access: { kind: "public" }, mode: "create", title: "Apply to E-Agle TRT", description: "Tell us who you are: we will contact you on Telegram.", prefill: true,
    fields: [{ fieldId: "Name", required: true }, { fieldId: "Surname", required: true }, { fieldId: "University Email", required: true, help: "Your university email" }, { fieldId: "Area", label: "Area of interest", required: true }, { fieldId: "Projects", label: "Projects of interest" }, { fieldId: "CV" }],
    set: [{ fieldId: "State", value: "Waiting" }, { fieldId: "Registration Date", value: "today" }],
    successMessage: "Thank you! We have your application and will be in touch shortly.",
  });
  await form("People", "HR Scouting", "hr-scouting", {
    access: { kind: "group", groupId: hr.id }, mode: "update", target: "pick", pickViewId: recruits.id, title: "HR Scouting",
    fields: [{ fieldId: "Determination", required: true }, { fieldId: "Skills", required: true }, { fieldId: "Scout Notes" }, { fieldId: "Interview Passed", label: "Did the candidate pass the interview?" }],
    set: [
      { fieldId: "State", value: "Project", when: { join: "and", items: [{ field: "Interview Passed", op: "checked" }] } },
      { fieldId: "State", value: "Rejected", when: { join: "and", items: [{ field: "Interview Passed", op: "notChecked" }] } },
    ],
  });
  await form("People", "Onboarding", "onboarding", {
    access: { kind: "public" }, mode: "update", target: "link", title: "Welcome to the team!", description: "Fill this in with your HR representative.",
    fields: [{ fieldId: "Phone", required: true }, { fieldId: "CF", required: true }, { fieldId: "Privacy Confirmation", required: true, label: "I authorize the treatment of my personal data" }],
    set: [{ fieldId: "State", value: "In trial" }, { fieldId: "Trial Start Date", value: "today" }],
  });
  await form("People", "Exit", "exit", {
    access: { kind: "members" }, mode: "update", target: "me", title: "Leaving the team",
    fields: [{ fieldId: "Exit Reason", help: "If you want, tell us why" }], set: [{ fieldId: "State", value: "Reachable" }, { fieldId: "Exit Date", value: "today" }],
    successMessage: "Thank you for everything you did with us.",
  });
  await form("Certificates", "Upload a certificate", "certificates", {
    access: { kind: "members" }, mode: "create", title: "Upload a certificate",
    fields: [{ fieldId: "Type", required: true }, { fieldId: "Date", required: true, help: "When you obtained it, not today" }, { fieldId: "File", required: true }],
    set: [{ fieldId: "Member", value: "@me" }],
  });
  console.log("A demonstration registry is ready: REGISTRY in the menu. Remove it with --remove.");
});
await pool.end();

