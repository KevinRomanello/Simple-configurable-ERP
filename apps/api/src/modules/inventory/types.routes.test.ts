import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { type Person, resetData, testApp } from "../../../test/helpers";

const api = testApp();
afterAll(() => api.close());
beforeEach(resetData);

const viewer: Person = { email: "viewer@team.test", role: "viewer" };
const pm: Person = { email: "pm-sw@team.test", role: "pm", areas: ["sw"] };

const areaId = async (code: string) => ((await api.get("/api/areas")).body as { id: number; code: string }[]).find((a) => a.code === code)!.id;

/** A Resistor of HW with a number in Ω (with prefixes), a power in W, a package from a list and a yes/no. */
async function resistor() {
  const type = (await api.post("/api/inventory/types", { name: "Resistor", areaId: await areaId("hw"), hazards: false })).body;
  const add = async (body: object) => (await api.post(`/api/inventory/types/${type.id}/params`, body)).body.id as number;
  return {
    type,
    ohm: await add({ name: "Resistance", kind: "number", unit: "Ω", prefixes: true }),
    watt: await add({ name: "Power", kind: "number", unit: "W", prefixes: true }),
    pkg: await add({ name: "Package", kind: "list", choices: ["0402", "0603", "0805"] }),
    note: await add({ name: "Series", kind: "text" }),
    rohs: await add({ name: "RoHS", kind: "yesno" }),
  };
}

const makeItem = async (body: object) => {
  const reply = await api.post("/api/inventory/items", body);
  expect(reply.status, JSON.stringify(reply.body)).toBe(201);
  return reply.body as { id: number };
};
const names = async (query: string) => ((await api.get(`/api/inventory/items?${query}`)).body as { name: string }[]).map((r) => r.name);

describe("item types", () => {
  it("are made with their parameters, in order, and listed with how much they are used", async () => {
    const r = await resistor();
    expect(r.type).toMatchObject({ name: "Resistor", hazards: false });
    await makeItem({ name: "R 10k", typeId: r.type.id, params: [{ paramId: r.ohm, value: "10000" }] });

    const [listed] = (await api.get("/api/inventory/types")).body;
    expect(listed).toMatchObject({ name: "Resistor", areaId: await areaId("hw"), items: 1 });
    expect(listed.params.map((p: { name: string }) => p.name)).toEqual(["Resistance", "Power", "Package", "Series", "RoHS"]);
    expect(listed.params[0]).toMatchObject({ kind: "number", unit: "Ω", prefixes: true, filledIn: 1 });
    expect(listed.params[2]).toMatchObject({ kind: "list", choices: ["0402", "0603", "0805"], filledIn: 0 });
  });

  it("refuses a twin name, a shape that does not fit the kind, and somebody who does not keep the inventory", async () => {
    const r = await resistor();
    expect((await api.post("/api/inventory/types", { name: "RESISTOR" })).status).toBe(409);
    const params = `/api/inventory/types/${r.type.id}/params`;
    expect((await api.post(params, { name: "resistance", kind: "text" })).status).toBe(409);
    expect((await api.post(params, { name: "Colour", kind: "text", unit: "Ω" })).status).toBe(400);
    expect((await api.post(params, { name: "Colour", kind: "text", choices: ["red"] })).status).toBe(400);
    expect((await api.post(params, { name: "Colour", kind: "list", choices: ["red", "Red"] })).status).toBe(400);
    expect((await api.post("/api/inventory/types", { name: "Cable", areaId: 99_999 })).status).toBe(400);

    expect((await api.as(viewer).post("/api/inventory/types", { name: "Cable" })).status).toBe(403);
    expect((await api.as(viewer).get("/api/inventory/types")).status).toBe(200); // everybody sees them
    expect((await api.as(pm).post("/api/inventory/types", { name: "Cable" })).status).toBe(201); // a pm of any area keeps them
  });
});

describe("what is written about an item", () => {
  it("is kept with the item, a number exact and written one way, and comes back in the list and in the item", async () => {
    const r = await resistor();
    const hw = await areaId("hw");
    const item = await makeItem({
      name: "R 4.7k 0603", areaId: hw, typeId: r.type.id,
      params: [{ paramId: r.ohm, value: "4700.000" }, { paramId: r.watt, value: "0.10" }, { paramId: r.pkg, value: "0603" }, { paramId: r.rohs, value: true }],
    });
    const expected = { [r.ohm]: "4700", [r.watt]: "0.1", [r.pkg]: "0603", [r.rohs]: true };
    const [row] = (await api.get("/api/inventory/items")).body;
    expect(row).toMatchObject({ areaId: hw, typeId: r.type.id, values: expected });
    expect((await api.get(`/api/inventory/items/${item.id}`)).body.values).toEqual(expected);
  });

  it("refuses what does not fit: a choice that is not in the list, a word for a number, a parameter of another type", async () => {
    const r = await resistor();
    const other = (await api.post("/api/inventory/types", { name: "Screw" })).body;
    const thread = (await api.post(`/api/inventory/types/${other.id}/params`, { name: "Thread", kind: "text" })).body.id;
    const base = { name: "R", typeId: r.type.id };
    expect((await api.post("/api/inventory/items", { ...base, params: [{ paramId: r.pkg, value: "0201" }] })).status).toBe(400);
    expect((await api.post("/api/inventory/items", { ...base, params: [{ paramId: r.ohm, value: "10k" }] })).status).toBe(400); // the site sends 10000
    expect((await api.post("/api/inventory/items", { ...base, params: [{ paramId: r.rohs, value: "yes" }] })).status).toBe(400);
    expect((await api.post("/api/inventory/items", { ...base, params: [{ paramId: thread, value: "M4" }] })).status).toBe(400);
    expect((await api.post("/api/inventory/items", { name: "R", params: [{ paramId: r.ohm, value: "1" }] })).status).toBe(400); // no type
    expect((await api.post("/api/inventory/items", { name: "R", typeId: 99_999 })).status).toBe(400);
    expect((await api.post("/api/inventory/items", { name: "R", areaId: 99_999 })).status).toBe(400);
    expect((await api.get("/api/inventory/items")).body).toEqual([]); // nothing was kept
  });

  it("changes only what is given, clears with null, and writes nothing to the history when nothing changes", async () => {
    const r = await resistor();
    const item = await makeItem({ name: "R", typeId: r.type.id, params: [{ paramId: r.ohm, value: "100" }, { paramId: r.note, value: "E12" }] });
    await api.patch(`/api/inventory/items/${item.id}`, { params: [{ paramId: r.ohm, value: "220" }, { paramId: r.note, value: null }] });
    expect((await api.get(`/api/inventory/items/${item.id}`)).body.values).toEqual({ [r.ohm]: "220" });

    const history = async () => (await api.get("/api/audit?table=item_param_value&limit=50")).body.entries.length;
    const before = await history();
    await api.patch(`/api/inventory/items/${item.id}`, { params: [{ paramId: r.ohm, value: "220.0" }] }); // the same number
    expect(await history()).toBe(before);
  });

  it("keeps the values of a type the item no longer has, out of sight, until it has that type again", async () => {
    const r = await resistor();
    const other = (await api.post("/api/inventory/types", { name: "Capacitor" })).body;
    const item = await makeItem({ name: "Part", typeId: r.type.id, params: [{ paramId: r.ohm, value: "10" }] });
    await api.patch(`/api/inventory/items/${item.id}`, { typeId: other.id });
    expect((await api.get(`/api/inventory/items/${item.id}`)).body.values).toEqual({});
    expect(await names(`p${r.ohm}min=1`)).toEqual([]); // and filters do not see it
    await api.patch(`/api/inventory/items/${item.id}`, { typeId: r.type.id });
    expect((await api.get(`/api/inventory/items/${item.id}`)).body.values).toEqual({ [r.ohm]: "10" });
  });
});

describe("filters of the list", () => {
  async function stock() {
    const r = await resistor();
    const hw = await areaId("hw");
    const make = (name: string, ohm: string, pkg: string, rohs: boolean, series?: string) =>
      makeItem({
        name, areaId: hw, typeId: r.type.id,
        params: [{ paramId: r.ohm, value: ohm }, { paramId: r.pkg, value: pkg }, { paramId: r.rohs, value: rohs }, ...(series ? [{ paramId: r.note, value: series }] : [])],
      });
    await make("R 1k", "1000", "0603", true, "Vishay CRCW");
    await make("R 4.7k", "4700", "0603", true);
    await make("R 10k", "10000", "0805", false, "Yageo RC_L");
    await make("R 100n", "0.0000001", "0402", false); // a silly resistor, to test tiny numbers
    await makeItem({ name: "Screwdriver", areaId: await areaId("mt-dmt") });
    await makeItem({ name: "Tape" }); // every area
    return r;
  }

  it("by area and by type", async () => {
    const r = await stock();
    expect(await names("area=hw")).toEqual(["R 100n", "R 10k", "R 1k", "R 4.7k"]);
    expect(await names("area=mt-dmt")).toEqual(["Screwdriver"]);
    expect(await names("area=nowhere")).toEqual([]);
    expect(await names(`type=${r.type.id}`)).toHaveLength(4);
  });

  it("by a number between two values, ends included and exact", async () => {
    const r = await stock();
    expect(await names(`p${r.ohm}min=1000&p${r.ohm}max=4700`)).toEqual(["R 1k", "R 4.7k"]);
    expect(await names(`p${r.ohm}min=0.0000001&p${r.ohm}max=0.0000001`)).toEqual(["R 100n"]);
    expect(await names(`p${r.ohm}=10000`)).toEqual(["R 10k"]);
  });

  it("by a choice, a piece of text, yes or no, and several at once (all of them)", async () => {
    const r = await stock();
    expect(await names(`p${r.pkg}=0603`)).toEqual(["R 1k", "R 4.7k"]);
    expect(await names(`p${r.note}=crcw`)).toEqual(["R 1k"]);
    expect(await names(`p${r.note}=_`)).toEqual(["R 10k"]); // _ is a character, not a wildcard
    expect(await names(`p${r.rohs}=yes`)).toEqual(["R 1k", "R 4.7k"]);
    expect(await names(`p${r.rohs}=no`)).toEqual(["R 100n", "R 10k"]);
    expect(await names(`p${r.rohs}=yes&p${r.ohm}min=2000`)).toEqual(["R 4.7k"]);
  });

  it("refuses a filter that does not make sense", async () => {
    const r = await stock();
    expect((await api.get(`/api/inventory/items?p${r.pkg}min=1`)).status).toBe(400);
    expect((await api.get(`/api/inventory/items?p${r.ohm}min=1k`)).status).toBe(400);
    expect((await api.get(`/api/inventory/items?p${r.rohs}=maybe`)).status).toBe(400);
    expect((await api.get("/api/inventory/items?p99999=1")).status).toBe(400);
  });
});

describe("changing a type", () => {
  it("lets the kind of a parameter change only while nothing is written in it", async () => {
    const r = await resistor();
    expect((await api.patch(`/api/inventory/params/${r.note}`, { kind: "list", choices: [{ name: "E12" }, { name: "E24" }] })).status).toBe(200);
    await makeItem({ name: "R", typeId: r.type.id, params: [{ paramId: r.note, value: "E12" }] });
    expect((await api.patch(`/api/inventory/params/${r.note}`, { kind: "text" })).status).toBe(409);
    // a number that becomes a text loses its unit
    const changed = (await api.patch(`/api/inventory/params/${r.watt}`, { kind: "text" })).body;
    expect(changed).toMatchObject({ kind: "text", unit: null, prefixes: false });
  });

  it("renames a choice for the items that have it (two at once swap), and refuses to take away one in use", async () => {
    const r = await resistor();
    const a = await makeItem({ name: "A", typeId: r.type.id, params: [{ paramId: r.pkg, value: "0603" }] });
    const b = await makeItem({ name: "B", typeId: r.type.id, params: [{ paramId: r.pkg, value: "0805" }] });
    const value = async (id: number) => (await api.get(`/api/inventory/items/${id}`)).body.values[r.pkg];

    const gone = await api.patch(`/api/inventory/params/${r.pkg}`, { choices: [{ was: "0402", name: "0402" }, { was: "0805", name: "0805" }] });
    expect(gone.status).toBe(409);
    expect(gone.body.error).toMatch(/1 items have "0603"/);

    const swap = [{ was: "0402", name: "0402" }, { was: "0603", name: "0805" }, { was: "0805", name: "0603" }];
    expect((await api.patch(`/api/inventory/params/${r.pkg}`, { choices: swap })).status).toBe(200);
    expect([await value(a.id), await value(b.id)]).toEqual(["0805", "0603"]);

    // an unused choice goes, a new one comes
    const next = (await api.patch(`/api/inventory/params/${r.pkg}`, { choices: [{ was: "0603", name: "0603" }, { was: "0805", name: "0805" }, { name: "1206" }] })).body;
    expect(next.choices).toEqual(["0603", "0805", "1206"]);
  });

  it("deletes a parameter with what was written in it (the history keeps it), and a type only when no item is of it", async () => {
    const r = await resistor();
    const item = await makeItem({ name: "R", typeId: r.type.id, params: [{ paramId: r.ohm, value: "1" }] });
    expect((await api.del(`/api/inventory/params/${r.ohm}`)).status).toBe(204);
    expect((await api.get(`/api/inventory/items/${item.id}`)).body.values).toEqual({});
    const entries = (await api.get("/api/audit?table=item_param_value&limit=50")).body.entries;
    expect(entries.map((e: { action: string }) => e.action)).toContain("delete");

    expect((await api.del(`/api/inventory/types/${r.type.id}`)).status).toBe(409);
    await api.patch(`/api/inventory/items/${item.id}`, { typeId: null });
    expect((await api.del(`/api/inventory/types/${r.type.id}`)).status).toBe(204);
    expect((await api.get("/api/inventory/types")).body).toEqual([]);
  });

  it("puts the parameters in a new order, which must name each of them once", async () => {
    const r = await resistor();
    const order = `/api/inventory/types/${r.type.id}/params/order`;
    expect((await api.put(order, { ids: [r.rohs, r.note, r.pkg, r.watt, r.ohm] })).status).toBe(204);
    const [type] = (await api.get("/api/inventory/types")).body;
    expect(type.params.map((p: { name: string }) => p.name)).toEqual(["RoHS", "Series", "Package", "Power", "Resistance"]);
    expect((await api.put(order, { ids: [r.ohm] })).status).toBe(400);
  });
});
