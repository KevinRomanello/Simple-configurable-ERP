import { deflateSync } from "node:zlib";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { runWrite } from "../core/tx";
import { userStorage } from "../platform/auth/auth.context";
import { addComment, resolveComment } from "../modules/registry/comments.service";
import { createRecords, listNames, updateRecords, uploadFile } from "../modules/registry/records.service";
import { createField, createTable, createView, getTable, setRegistrySettings, updateField, updateTable } from "../modules/registry/schema.service";
import { createWebhook } from "../modules/registry/webhooks.service";
import { loadUser } from "../platform/users/users.service";
import { db, pool } from "./client";
import { appUser, regTable } from "./schema";

// A made-up registry shaped like the team's (docs/anagrafiche.md, §1.1), only to look at and try: areas,
// projects and workgroups, roles, people from the application to the exit (with their pictures, comments and colours
// by state), certificates with their expiry, groups, rules and the forms of the HR path, a table of places with a map
// and a table of tasks with a gantt and its dependencies, a public view, a webhook (switched off). Nobody here is real.
// It goes through the services of the registry as the first admin, so it is in the history like any other change.
//
//   pnpm --filter @erp/api db:seed-registry             make it (refused if a table People is there)
//   pnpm --filter @erp/api db:seed-registry -- --remove take the demonstration tables away

const remove = process.argv.includes("--remove");
const DEMO_TABLES = ["Telemetry Tasks", "Venues", "Certificates", "Certificate Types", "People", "Roles", "Projects", "Areas"];

/** A small made-up portrait as a PNG (written here, no picture library): a soft gradient, a head and shoulders, one colour per person. */
function portrait(hue: number): Buffer {
  const size = 160;
  const hsl = (h: number, saturation: number, light: number): [number, number, number] => {
    const k = (n: number) => (n + h / 30) % 12;
    const a = saturation * Math.min(light, 1 - light);
    const f = (n: number) => Math.round(255 * (light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
    return [f(0), f(8), f(4)];
  };
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // no filter on this line
    for (let x = 0; x < size; x++) {
      let colour = hsl(hue, 0.5, 0.35 + 0.3 * (y / size));
      if ((x - 80) ** 2 + (y - 66) ** 2 < 28 ** 2) colour = hsl(hue, 0.4, 0.82); // the head
      else if (((x - 80) / 62) ** 2 + ((y - 168) / 58) ** 2 < 1) colour = hsl(hue, 0.55, 0.9); // the shoulders
      raw.set(colour, y * (size * 3 + 1) + 1 + x * 3);
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes: Buffer) => {
    let c = 0xffffffff;
    for (const b of bytes) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8 bits, RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const STATE_COLOURS: Record<string, string> = {
  Waiting: "#94a3b8", Contacted: "#38bdf8", Project: "#a78bfa", "In trial": "#fbbf24", "Active Member": "#4ade80", Reachable: "#2dd4bf", Alumno: "#9ca3af", Rejected: "#f87171",
};

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
  await field("People", { name: "State", type: "select", options: { choices: Object.entries(STATE_COLOURS).map(([name, color]) => ({ name, color })) } });
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
    ["Martina", "Bruno", "Active Member", "martina.bruno@uni.test", "CM", ["Social Media"], ["Core Team"]],
    ["Davide", "Greco", "Contacted", "davide.greco@uni.test", "HW", ["Low Voltage"], []],
    ["Alice", "Rizzo", "Active Member", "alice.rizzo@uni.test", "MT", ["Chassis"], []],
    ["Federico", "Costa", "Rejected", "federico.costa@uni.test", "SW", ["Telemetry"], []],
  ];
  await createRecords("People", people.map(([name, surname, state, email, area, ps, rs], i) => ({
    fields: {
      Name: name, Surname: surname, State: state, "University Email": email, Area: [areas[area]], Projects: ps.map((p) => projects[p]), Roles: rs.map((r) => roles[r]),
      // the applications of this autumn, and the entry a month later for who got in
      "Registration Date": `2026-${String(9 + (i % 3)).padStart(2, "0")}-${String(3 + ((3 * i) % 24)).padStart(2, "0")}`,
      ...(state === "Active Member" ? { "Entry Date": `2026-${String(10 + (i % 3)).padStart(2, "0")}-${String(3 + ((3 * i) % 24)).padStart(2, "0")}` } : {}),
      Determination: 5 + (i % 5), Skills: 4 + (i % 6), "Interview Passed": !["Waiting", "Contacted", "Rejected"].includes(state),
    },
  })));

  // a portrait for each person (the gallery «Faces» and the big picture when it is clicked), and what the areas make of their people
  const faces = await ids("People");
  for (const [i, person] of people.entries()) {
    const name = `${person[0]} ${person[1]}`;
    await uploadFile("People", faces[name]!, "Photo", `${person[0]!.toLowerCase()}-${person[1]!.toLowerCase()}.png`, "image/png", portrait((i * 47) % 360));
  }
  await field("Areas", { name: "People", type: "rollup", options: { linkFieldId: "Members", fieldId: "Name", fn: "count" }, description: "How many people are in the area" });
  await field("Areas", { name: "Average skills", type: "rollup", options: { linkFieldId: "Members", fieldId: "Skills", fn: "avg" } });
  // comments, one of them closed
  await addComment("People", faces["Paolo Gatti"]!, "Trial review next Tuesday: ask Elena how the soldering went.");
  const thread = await addComment("People", faces["Paolo Gatti"]!, "Done: he stays with Low Voltage.");
  await resolveComment(thread[thread.length - 1]!.id, true);
  await addComment("People", faces["Luca Galli"]!, "Still waiting for the answer on Telegram.");

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
  // what a link to a certificate shows is its first field (its name): without one it shows only «#259». The type and the date make one
  await field("Certificates", { name: "Type Name", type: "lookup", options: { linkFieldId: "Type", fieldId: "Name" } });
  const certificateName = await field("Certificates", { name: "Title", type: "formula", options: { expression: 'CONCAT({Type Name}, " · ", {Date})' }, description: "What a link to this certificate shows: its type and its date" });
  await updateTable("Certificates", { primaryFieldId: certificateName.id });
  const types = await ids("Certificate Types");
  const who = await ids("People");
  await createRecords("Certificates", [
    ["Giulia Ferri", "Medium Risk Safety Course", "2025-10-01"], ["Marco Rinaldi", "Firefighting Course", "2020-03-15"], ["Paolo Gatti", "First Aid", "2026-09-20"],
  ].map(([person, type, date]) => ({ fields: { Member: [who[person!]], Type: [types[type!]], Date: date } })));
  await createView("Certificates", { name: "Expired", type: "grid", config: { filter: { join: "and", items: [{ field: "Expiration Date", op: "lt", value: "today" }] } } });

  // who is who: the people table, the groups, the rules
  const peopleTable = await getTable("People");
  await setRegistrySettings({ peopleTableId: peopleTable.id, emailFieldId: team.id });
  const group = (name: string, filter: object) => createView("People", { name, type: "grid", config: { group: true, folder: "Groups", filter: filter as never } });
  const current = await group("Current Members", { join: "and", items: [{ field: "State", op: "anyOf", value: ["In trial", "Active Member"] }] });
  const board = await group("Executive Board", { join: "and", items: [{ field: "Role Tags", op: "anyOf", value: ["CT", "TL", "CLO"] }] });
  const hr = await group("HR", { join: "and", items: [{ field: "Projects", op: "anyOf", value: ["Human Resources"] }, { field: "State", op: "anyOf", value: ["In trial", "Active Member"] }] });
  await createView("People", { name: "Everybody", type: "grid", config: { colorBy: "State", rowHeight: "medium", frozen: 1, sorts: [{ field: "Registration Date", dir: "desc" }], description: "Every row has the colour of its state" } as never });
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
  // places, on a map
  await createTable({ name: "Venues", section: "Logistics", icon: "📍", description: "Workshops, campuses and sponsors, on a map (made-up places)" });
  await field("Venues", { name: "Kind", type: "select", options: { choices: [{ name: "Workshop", color: "#fbbf24" }, { name: "University", color: "#38bdf8" }, { name: "Sponsor", color: "#4ade80" }, { name: "Track", color: "#f87171" }] } });
  await field("Venues", { name: "Location", type: "geodata" });
  await field("Venues", { name: "Notes", type: "longtext" });
  await createRecords("Venues", [
    ["Demo Workshop North", "Workshop", "46.0914;11.1305", "Where the chassis is welded."], ["Demo Campus Povo", "University", "46.0663;11.1503", "Lectures and the meeting room."],
    ["Demo Test Track", "Track", "45.8905;11.0400", "Track days, booked a month ahead."], ["Demo Sponsor HQ A", "Sponsor", "46.0690;11.1210", "Visit in December."],
    ["Demo Sponsor HQ B", "Sponsor", "45.8870;10.8440", "Sends the batteries."], ["Demo Garage Annex", "Workshop", "46.1760;11.0970", "Storage for the old cars."],
  ].map(([name, kind, location, notes]) => ({ fields: { Name: name, Kind: kind, Location: location, Notes: notes } })));
  await createView("Venues", { name: "Map", type: "map", config: { geoField: "Location", description: "The pieces of the map come through the server of the ERP" } as never });
  await createView("Venues", { name: "By kind", type: "grid", config: { colorBy: "Kind" } as never });

  // tasks: a gantt with its dependencies, and a board
  await createTable({ name: "Telemetry Tasks", section: "Logistics", icon: "🗓️", description: "A small plan: the bars of the gantt are dragged, and what comes after follows" });
  await field("Telemetry Tasks", { name: "Owner", type: "link", options: { tableId: "People", multiple: false }, inverseName: "Tasks" });
  await field("Telemetry Tasks", { name: "Start", type: "date" });
  await field("Telemetry Tasks", { name: "End", type: "date" });
  await field("Telemetry Tasks", { name: "Days", type: "formula", options: { expression: 'DATETIME_DIFF({End}, {Start}, "days")' } });
  await field("Telemetry Tasks", { name: "Status", type: "select", options: { choices: [{ name: "To do", color: "#94a3b8" }, { name: "Doing", color: "#fbbf24" }, { name: "Done", color: "#4ade80" }] } });
  await field("Telemetry Tasks", { name: "Next", type: "link", options: { tableId: "Telemetry Tasks", multiple: true }, inverseName: "Previous" });
  const tasks = [
    ["Define the CAN messages", "Giulia Ferri", "2026-11-02", "2026-11-13", "Done"], ["Write the logger firmware", "Giulia Ferri", "2026-11-09", "2026-12-04", "Doing"],
    ["Build the dashboard", "Giulia Ferri", "2026-11-23", "2026-12-18", "Doing"], ["Test on the car", "Elena Conti", "2026-12-14", "2026-12-22", "To do"],
    ["Analyse the run", "Marco Rinaldi", "2026-12-23", "2027-01-15", "To do"],
  ] as const;
  await createRecords("Telemetry Tasks", tasks.map(([name, owner, start, end, status]) => ({ fields: { Name: name, Owner: [who[owner]], Start: start, End: end, Status: status } })));
  const taskIds = await ids("Telemetry Tasks");
  const after: [string, string[]][] = [["Define the CAN messages", ["Write the logger firmware"]], ["Write the logger firmware", ["Test on the car"]], ["Build the dashboard", ["Test on the car"]], ["Test on the car", ["Analyse the run"]]];
  await updateRecords("Telemetry Tasks", after.map(([name, next]) => ({ id: taskIds[name]!, fields: { Next: next.map((n) => taskIds[n]) } })));
  await createView("Telemetry Tasks", { name: "Gantt", type: "timeline", config: { dateField: "Start", endDateField: "End", dependencyField: "Next" } as never });
  await createView("Telemetry Tasks", { name: "Board", type: "kanban", config: { groupBy: "Status" } as never });
  await createView("Telemetry Tasks", { name: "Calendar", type: "calendar", config: { dateField: "Start" } as never });
  for (const table of ["Venues"]) await updateTable(table, { access: [{ who: { kind: "everyone" }, level: "read" }, { who: { kind: "group", groupId: board.id }, level: "manage" }] });
  await updateTable("Telemetry Tasks", { access: [{ who: { kind: "group", groupId: current.id }, level: "edit" }, { who: { kind: "group", groupId: board.id }, level: "manage" }] });

  // an address anybody can open, read-only, with the fields of the view (the areas are made up, and nothing personal)
  await createView("Areas", { name: "Public list", type: "grid", slug: "areas-public", config: { shared: true, sharedDownload: true, hidden: ["Members", "Projects"], description: "Open it without signing in: /api/registry/public/views/areas-public" } as never });

  // a webhook, switched off: it would call n8n for every new application
  await createWebhook("People", { name: "New application, to n8n (off)", url: "https://n8n.example.test/webhook/new-application", events: ["create"], active: false });
  console.log("A demonstration registry is ready: REGISTRY in the menu. Remove it with --remove.");
});
await pool.end();

