import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ADMIN, createUser, resetData, testApp } from "../../../test/helpers";
import { userStorage } from "../../platform/auth/auth.context";
import { loadUser } from "../../platform/users/users.service";
import { importFromNocodb } from "./nocodb";

// A fake NocoDB with the shapes of its API v3 (meta and data, pages with `next`, files), and made-up people.

const api = testApp();
afterAll(() => api.close());
beforeEach(async () => {
  await resetData();
  await createUser(ADMIN);
});

const BASE = "pTEST";
const tables = {
  mAreas: {
    id: "mAreas", title: "Areas", display_field_id: "cTag",
    fields: [
      { id: "cTag", title: "Tag", type: "SingleLineText" },
      { id: "cAreaPeople", title: "People", type: "LinkToAnotherRecord", options: { related_table_id: "mPeople", relation_type: "om" } },
    ],
  },
  mProvinces: {
    id: "mProvinces", title: "Provinces", display_field_id: "cProv",
    fields: [
      { id: "cProv", title: "Name", type: "SingleLineText" },
      // two links from the same table: only the data says which goes with which
      { id: "cBorn", title: "Born", type: "LinkToAnotherRecord", options: { related_table_id: "mPeople", relation_type: "om" } },
      { id: "cResidents", title: "Residents", type: "LinkToAnotherRecord", options: { related_table_id: "mPeople", relation_type: "om" } },
    ],
  },
  mPeople: {
    id: "mPeople", title: "People", display_field_id: "cFull",
    fields: [
      { id: "cId", title: "Id", type: "ID" },
      { id: "cName", title: "Name", type: "SingleLineText" },
      { id: "cSurname", title: "Surname", type: "SingleLineText" },
      { id: "cFull", title: "Full Name", type: "Formula", options: { formula: 'CONCAT({Name}, " ", {Surname})' } },
      { id: "cState", title: "State", type: "SingleSelect", options: { choices: [{ title: "Waiting", color: "#f00" }, { title: "Active Member", color: "#0f0" }] } },
      { id: "cSkills", title: "Skills", type: "MultiSelect", options: { choices: [{ title: "C" }, { title: "Python" }] } },
      { id: "cRating", title: "Rating", type: "Rating", options: { max: 10 } },
      { id: "cEmail", title: "Email", type: "Email" },
      { id: "cArea", title: "Area", type: "LinkToAnotherRecord", options: { related_table_id: "mAreas", relation_type: "mo" } },
      { id: "cAreaTag", title: "Area Tag", type: "Lookup", options: { related_field_id: "cArea", related_table_lookup_field_id: "cTag" } },
      { id: "cBirth", title: "Birth Place", type: "LinkToAnotherRecord", options: { related_table_id: "mProvinces", relation_type: "mo" } },
      { id: "cHome", title: "Home Town", type: "LinkToAnotherRecord", options: { related_table_id: "mProvinces", relation_type: "mo" } },
      { id: "cCV", title: "CV", type: "Attachment" },
      { id: "cGeo", title: "Where", type: "GeoData" },
      { id: "cCreated", title: "CreatedAt", type: "CreatedTime" },
    ],
  },
  // the newer types of NocoDB, a default value, a picture of another field, a button that opens an address
  mShifts: {
    id: "mShifts", title: "Shifts", display_field_id: "sName",
    fields: [
      { id: "sName", title: "Name", type: "SingleLineText" },
      { id: "sStarts", title: "Starts", type: "Time" },
      { id: "sLength", title: "Length", type: "Duration", options: { duration_format: "h:mm" } },
      { id: "sYear", title: "Season", type: "Year" },
      { id: "sLead", title: "Lead", type: "User" },
      { id: "sState", title: "State", type: "SingleSelect", default_value: "'Planned'", options: { choices: [{ title: "Planned" }, { title: "Done" }] } },
      { id: "sBadge", title: "Badge", type: "QrCode", options: { fk_qr_value_column_id: "sName" } },
      { id: "sMap", title: "Map", type: "Button", options: { type: "url", label: "Map", formula: '"https://maps.test/?q=" & {Name}' } },
    ],
  },
};
const records: Record<string, { id: number; fields: Record<string, unknown> }[]> = {
  mAreas: [
    { id: 1, fields: { Tag: "SW", People: [{ id: 1 }, { id: 2 }] } },
    { id: 2, fields: { Tag: "HW", People: [{ id: 3 }] } },
  ],
  mProvinces: [
    { id: 1, fields: { Name: "Trento", Born: [{ id: 1 }], Residents: [{ id: 1 }, { id: 2 }] } },
    { id: 2, fields: { Name: "Verona", Born: [{ id: 2 }, { id: 3 }], Residents: [{ id: 3 }] } },
  ],
  mPeople: [
    { id: 1, fields: { Name: "Anna", Surname: "Bianchi", State: "Active Member", Skills: ["C", "Python"], Rating: 8, Email: "Anna@Uni.test", Area: { id: 1 }, "Birth Place": { id: 1 }, "Home Town": { id: 1 }, CV: [{ title: "cv.pdf", mimetype: "application/pdf", url: "/files/cv.pdf" }], Where: "46.06;11.12" } },
    { id: 2, fields: { Name: "Luca", Surname: "Verdi", State: "Waiting", Skills: "Python", Rating: 4, Email: "not an email", Area: { id: 1 }, "Birth Place": { id: 2 }, "Home Town": { id: 1 } } },
    { id: 3, fields: { Name: "Sara", Surname: "Neri", State: "Waiting", Rating: null, Email: "sara@uni.test", Area: { id: 2 }, "Birth Place": { id: 2 }, "Home Town": { id: 2 } } },
  ],
  mShifts: [{ id: 1, fields: { Name: "Lab", Starts: "09:30:00", Length: 5400, Season: 2026, Lead: [{ id: "u1", email: ADMIN.email.toUpperCase(), display_name: "Admin" }], State: "Done" } }],
};

async function fakeNocodb() {
  const seen: string[] = [];
  const server = createServer((request, response) => {
    seen.push(String(request.headers["xc-token"]));
    const url = new URL(request.url ?? "/", "http://x");
    const send = (body: unknown) => response.setHeader("Content-Type", "application/json").end(JSON.stringify(body));
    if (url.pathname === `/api/v3/meta/bases/${BASE}/tables`) return send({ list: Object.values(tables).map((t) => ({ id: t.id, title: t.title })) });
    if (url.pathname === "/api/v3/meta/bases") return send({ list: [{ id: BASE, title: "HR & Recruitment" }] });
    const meta = /^\/api\/v3\/meta\/bases\/pTEST\/tables\/(\w+)$/.exec(url.pathname);
    if (meta) return send({ ...tables[meta[1] as keyof typeof tables], base_id: BASE });
    const data = /^\/api\/v3\/data\/pTEST\/(\w+)\/records$/.exec(url.pathname);
    if (data) {
      // two records a page, to follow `next`
      const page = Number(url.searchParams.get("page") ?? 1);
      const all = records[data[1]!]!;
      const next = page * 2 < all.length ? `http://${request.headers.host}${url.pathname}?page=${page + 1}&pageSize=2` : null;
      return send({ records: all.slice((page - 1) * 2, page * 2), next });
    }
    if (url.pathname === "/files/cv.pdf") return response.setHeader("Content-Type", "application/pdf").end(Buffer.from("%PDF-1.4 a cv"));
    response.statusCode = 404;
    response.end("{}");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen, close: () => server.close() };
}

const asAdmin = async <T>(work: () => Promise<T>) => userStorage.run((await loadUser((await createUser(ADMIN)).id))!, work);

describe("bringing NocoDB over", () => {
  it("without --apply says what it would do and writes nothing", async () => {
    const noco = await fakeNocodb();
    try {
      const report = await asAdmin(() => importFromNocodb({ url: noco.url, token: "tok", baseIds: [BASE], apply: false }));
      expect(report.applied).toBe(false);
      expect(report.tables).toEqual([{ name: "Areas", fields: 2, records: 2 }, { name: "Provinces", fields: 3, records: 2 }, { name: "People", fields: 15, records: 3 }, { name: "Shifts", fields: 8, records: 1 }]);
      expect(report.warnings).toEqual([]);
      expect(noco.seen.every((t) => t === "tok")).toBe(true);
      expect(await api.get("/api/registry/tables").then((r) => r.body)).toEqual([]);
    } finally {
      noco.close();
    }
  });

  it("brings tables, fields, records, links in pairs, lookups, formulas and files", async () => {
    const noco = await fakeNocodb();
    try {
      const report = await asAdmin(() => importFromNocodb({ url: noco.url, token: "tok", baseIds: [BASE], apply: true }));
      expect(report.applied).toBe(true);
      expect(report.warnings).toEqual(["People #2 › Email: Email: not a valid email address: left empty"]);

      const people = (await api.get("/api/registry/tables/People")).body;
      expect(people.section).toBe("HR & Recruitment");
      expect(people.fields.map((f: any) => `${f.name}:${f.type}`)).toEqual([
        "Name:text", "Surname:text", "State:select", "Skills:multiselect", "Rating:rating", "Email:email", "CV:attachment", "Where:geodata",
        "Area:link", "Birth Place:link", "Home Town:link", "Full Name:formula", "Area Tag:lookup",
      ]);
      expect(people.fields.find((f: any) => f.id === people.primaryFieldId).name).toBe("Full Name");
      const list = (await api.get("/api/registry/tables/People/records?sort=Surname")).body.records.map((r: any) => r.fields);
      expect(list[0]).toMatchObject({ "Full Name": "Anna Bianchi", State: "Active Member", Skills: ["C", "Python"], Rating: 8, Email: "anna@uni.test", "Area Tag": ["SW"], Area: [{ name: "SW" }], "Birth Place": [{ name: "Trento" }], "Home Town": [{ name: "Trento" }] });
      expect(list[0].CV).toEqual([{ id: expect.any(Number), name: "cv.pdf", mime: "application/pdf", size: 13 }]);
      expect(list[2]).toMatchObject({ "Full Name": "Luca Verdi", Skills: ["Python"], Email: null, "Birth Place": [{ name: "Verona" }], "Home Town": [{ name: "Trento" }] });
      // the other sides are the ones of NocoDB, found by their links
      const provinces = (await api.get("/api/registry/tables/Provinces/records?sort=Name")).body.records.map((r: any) => r.fields);
      expect(provinces[0].Born.map((p: any) => p.name)).toEqual(["Anna Bianchi"]);
      expect(provinces[0].Residents.map((p: any) => p.name).sort()).toEqual(["Anna Bianchi", "Luca Verdi"]);
      const areas = (await api.get("/api/registry/tables/Areas")).body;
      expect(areas.fields.map((f: any) => f.name)).toEqual(["Tag", "People"]);
      // the newer types: time, duration, a year as a number, people of NocoDB as users of the ERP by their email
      const shifts = (await api.get("/api/registry/tables/Shifts")).body;
      expect(shifts.fields.map((f: any) => `${f.name}:${f.type}`)).toEqual(["Name:text", "Starts:time", "Length:duration", "Season:number", "Lead:user", "State:select", "Badge:qrcode", "Map:button"]);
      const shift = (await api.get("/api/registry/tables/Shifts/records")).body.records[0].fields;
      expect(shift).toMatchObject({ Starts: "09:30:00", Length: 5400, Season: 2026, Lead: [{ name: expect.any(String) }], State: "Done", Badge: "Lab", Map: "https://maps.test/?q=Lab" });
      // the default of NocoDB came along
      expect((await api.post("/api/registry/tables/Shifts/records", { fields: { Name: "New" } })).body.fields.State).toBe("Planned");
      // twice: refused, nothing is overwritten
      const again = await asAdmin(() => importFromNocodb({ url: noco.url, token: "tok", baseIds: [BASE], apply: true }));
      expect(again.applied).toBe(false);
      expect(again.warnings.filter((w) => w.startsWith("There is already a table"))).toHaveLength(4);
    } finally {
      noco.close();
    }
  });
});
