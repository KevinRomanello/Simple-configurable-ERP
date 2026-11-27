import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/client";
import { cashEntryLine } from "../../db/schema/treasury-budget";
import { resetData, testApp } from "../../../test/helpers";

// Deleting an inflow of CASH FLOW choosing where from: the expected one, the actual one, the movement of the register.

const api = testApp();
afterAll(() => api.close());
beforeEach(resetData);

const TREASURER = { email: "treasury-del@team.test", role: "pm" as const, treasury: true };
const SP = { email: "sp-del@team.test", role: "pm" as const, sponsors: true };
const PM = { email: "pm-del@team.test", role: "pm" as const, areas: ["mt-dmt"] };
const VIEWER = { email: "viewer-del@team.test", role: "viewer" as const };

const inflow = async (body: object = {}) =>
  (await api.post("/api/inflows", { phase: "estimate", sourceName: "Acme", amount: "1000", inflowDate: "2026-12-01", ...body })).body;
/** Marks the inflow as received with a new movement of the register (the amount, 800 unless said) and gives the movement's id. */
async function receive(inflowId: number, amount = "800") {
  expect((await api.post(`/api/inflows/${inflowId}/receive`, { on: "2026-12-05", account: "bank", amount })).status).toBe(204);
  const row = (await api.get("/api/inflows?phase=estimate")).body.find((i: { id: number }) => i.id === inflowId);
  return row.cashEntryId as number;
}
type Client = Pick<typeof api, "get" | "post">;
const related = (query: string, as: Client = api) => as.get(`/api/inflows/related?${query}`);
const remove = (body: { inflowIds?: number[]; cashEntryIds?: number[] }, as: Client = api) => as.post("/api/inflows/delete", { inflowIds: [], cashEntryIds: [], ...body });
const estimate = async () => (await api.get("/api/inflows?phase=estimate")).body as { id: number; cashEntryId: number | null }[];
const entries = async () => ((await api.get("/api/cash/register?year=2026")).body.entries as { id: number }[]).map((e) => e.id);

describe("what is of the same company", () => {
  it("lists the expected inflows (the instalments too, whatever the capitals and the spaces), the actual ones and the movements tied to them", async () => {
    const first = await inflow();
    const second = await inflow({ sourceName: "  ACME ", amount: "500" }); // the same company, written another way
    await inflow({ sourceName: "Other srl" });
    const actual = await inflow({ phase: "actual", amount: "300" });
    const entryId = await receive(first.id);
    // a movement of the register that says the same, but that nobody received, is not of this company
    await api.post("/api/cash/entries", { on: "2026-12-06", description: "Acme", account: "bank", direction: "in", amount: "10" });

    const list = (await related(`inflowId=${second.id}`)).body;
    expect(list.expected.map((v: { id: number }) => v.id).sort()).toEqual([first.id, second.id].sort());
    expect(list.actual.map((v: { id: number }) => v.id)).toEqual([actual.id]);
    expect(list.register).toEqual([expect.objectContaining({ kind: "entry", id: entryId, amount: "800.00", canDelete: true, why: null })]);
    expect(list.registerHidden).toBe(0);
    // what was pressed, and which inflow was received
    expect(list.expected.find((v: { id: number }) => v.id === second.id)).toMatchObject({ pressed: true, received: false, canDelete: true });
    expect(list.expected.find((v: { id: number }) => v.id === first.id)).toMatchObject({ pressed: false, received: true, receivedOn: "2026-12-05" });
  });

  it("starts from a movement of the register too: the company of the inflow it received, or the movement alone", async () => {
    const gala = await inflow({ sourceName: "Gala" });
    const entryId = await receive(gala.id);
    const alone = (await api.post("/api/cash/entries", { on: "2026-12-06", description: "Gift", account: "cash", direction: "in", amount: "10" })).body;

    const fromEntry = (await related(`cashEntryId=${entryId}`)).body;
    expect(fromEntry.expected.map((v: { id: number }) => v.id)).toEqual([gala.id]);
    expect(fromEntry.register).toEqual([expect.objectContaining({ id: entryId, pressed: true })]);

    const lone = (await related(`cashEntryId=${alone.id}`)).body;
    expect(lone).toMatchObject({ expected: [], actual: [] });
    expect(lone.register).toEqual([expect.objectContaining({ id: alone.id, pressed: true })]);
  });

  it("says that a typed actual inflow is not counted while the BANK comes from the register", async () => {
    const actual = await inflow({ phase: "actual", amount: "300" });
    expect((await related(`inflowId=${actual.id}`)).body.actual[0].counted).toBe(true); // no register yet: it counts
    // the register is the BANK once it has a balance to start from
    await api.put("/api/cash/openings", { year: 2026, account: "bank", amount: "1" });
    expect((await related(`inflowId=${actual.id}`)).body.actual[0].counted).toBe(false);
  });

  it("asks for one thing to start from, and knows what it has not got", async () => {
    expect((await related("")).status).toBe(400);
    const both = await related("inflowId=1&cashEntryId=1");
    expect(both.status).toBe(400);
    expect((await related("inflowId=99999")).status).toBe(404);
    expect((await related("cashEntryId=99999")).status).toBe(404);
  });
});

describe("deleting where the person chooses", () => {
  it("deletes only the expected inflow: the movement stays and the actual side does not change", async () => {
    const expected = await inflow();
    const actual = await inflow({ phase: "actual" });
    const entryId = await receive(expected.id);
    expect((await remove({ inflowIds: [expected.id] })).status).toBe(204);
    expect((await estimate()).map((i) => i.id)).toEqual([]);
    expect(await entries()).toContain(entryId);
    expect((await api.get("/api/inflows?phase=actual")).body.some((i: { id: number }) => i.id === actual.id)).toBe(true);
  });

  it("deletes only the movement: the inflow is expected again", async () => {
    const expected = await inflow();
    const entryId = await receive(expected.id);
    expect((await remove({ cashEntryIds: [entryId] })).status).toBe(204);
    expect(await entries()).not.toContain(entryId);
    expect(await estimate()).toEqual([expect.objectContaining({ id: expected.id, cashEntryId: null })]);
  });

  it("deletes everything chosen in one go: the expected, the actual and the movement", async () => {
    const expected = await inflow();
    const actual = await inflow({ phase: "actual" });
    const entryId = await receive(expected.id);
    expect((await remove({ inflowIds: [expected.id, actual.id], cashEntryIds: [entryId] })).status).toBe(204);
    expect(await estimate()).toEqual([]);
    expect((await api.get("/api/inflows?phase=actual")).body).toEqual([]);
    expect(await entries()).not.toContain(entryId);
  });

  it("deletes nothing at all when one of the things is refused", async () => {
    const plain = await inflow({ sourceName: "Plain" });
    const gala = await inflow({ sourceName: "Gala" });
    const entryId = await receive(gala.id);
    // a movement that pays budget lines (a strange thing for money in: put there by hand) is not deleted from here
    const project = (await api.post("/api/projects", { areaCode: "mt-dmt", name: "P" })).body;
    const line = (await api.post(`/api/projects/${project.id}/lines`, { item: "L" })).body;
    await db.insert(cashEntryLine).values({ entryId, lineId: line.id, amount: "1" });

    const refused = await remove({ inflowIds: [plain.id], cashEntryIds: [entryId] });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatch(/pays budget lines/);
    expect((await estimate()).map((i) => i.id).sort()).toEqual([plain.id, gala.id].sort());
    expect(await entries()).toContain(entryId);
  });

  it("refuses money that went out, things of nobody and an empty request", async () => {
    const out = (await api.post("/api/cash/entries", { on: "2026-12-06", description: "Bill", account: "bank", direction: "out", amount: "10" })).body;
    expect((await remove({ cashEntryIds: [out.id] })).status).toBe(409);
    expect((await remove({ inflowIds: [99999] })).status).toBe(404);
    expect((await remove({ cashEntryIds: [99999] })).status).toBe(404);
    expect((await remove({})).status).toBe(400);
    expect(await entries()).toContain(out.id);
  });
});

describe("who can delete what", () => {
  it("a project manager with only the sponsors box deletes inflows that were not received, and nothing else", async () => {
    const plain = await inflow({ sourceName: "Plain" });
    const gala = await inflow({ sourceName: "Gala" });
    const entryId = await receive(gala.id);
    const sponsors = api.as(SP);

    // what the list says: the received inflow and the movement are grey, and the movements are only counted
    const list = (await related(`inflowId=${gala.id}`, sponsors)).body;
    expect(list.expected[0]).toMatchObject({ received: true, canDelete: false, why: "Only the treasury can delete a received inflow" });
    expect(list.register).toEqual([]);
    expect(list.registerHidden).toBe(1);

    // the request with a received inflow, or with a movement, is refused and the rest of it is not done
    const withReceived = await remove({ inflowIds: [plain.id, gala.id] }, sponsors);
    expect(withReceived.status).toBe(403);
    expect(withReceived.body.error).toMatch(/already received/);
    expect((await remove({ inflowIds: [plain.id], cashEntryIds: [entryId] }, sponsors)).status).toBe(403);
    expect((await estimate()).map((i) => i.id).sort()).toEqual([plain.id, gala.id].sort());

    expect((await remove({ inflowIds: [plain.id] }, sponsors)).status).toBe(204);
    expect((await estimate()).map((i) => i.id)).toEqual([gala.id]);
  });

  it("the treasury deletes a received inflow and its movement", async () => {
    const gala = await inflow({ sourceName: "Gala" });
    const entryId = await receive(gala.id);
    const treasury = api.as(TREASURER);
    expect((await related(`inflowId=${gala.id}`, treasury)).body.register).toHaveLength(1);
    expect((await remove({ inflowIds: [gala.id], cashEntryIds: [entryId] }, treasury)).status).toBe(204);
    expect(await estimate()).toEqual([]);
    expect(await entries()).not.toContain(entryId);
  });

  it("a viewer and a project manager without the boxes can neither list nor delete", async () => {
    const one = await inflow();
    for (const person of [VIEWER, PM]) {
      const as = api.as(person);
      expect((await related(`inflowId=${one.id}`, as)).status).toBe(403);
      expect((await remove({ inflowIds: [one.id] }, as)).status).toBe(403);
    }
    expect(await estimate()).toHaveLength(1);
  });

  it("nothing is deleted in a read-only season, and the list says so", async () => {
    const one = await inflow();
    const season = (await api.get("/api/seasons/current")).body;
    await api.patch(`/api/seasons/${season.id}`, { readOnly: true });
    const list = (await related(`inflowId=${one.id}`)).body;
    expect(list.expected[0]).toMatchObject({ canDelete: false, why: expect.stringMatching(/read-only/) });
    expect((await remove({ inflowIds: [one.id] })).status).toBe(409);
    await api.patch(`/api/seasons/${season.id}`, { readOnly: false });
    expect(await estimate()).toHaveLength(1);
  });
});
