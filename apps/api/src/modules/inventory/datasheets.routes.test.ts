import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ADMIN, cookieFor, createUser, type Person, resetData, testApp } from "../../../test/helpers";

const api = testApp();
afterAll(() => api.close());
beforeEach(resetData);

const viewer: Person = { email: "viewer@team.test", role: "viewer" };
const pm: Person = { email: "pm-sw@team.test", role: "pm", areas: ["sw"] };

const pdf = (text = "datasheet") => Buffer.from(`%PDF-1.4\n% ${text}\n%%EOF\n`);
const makeItem = async (name = "Epoxy") => (await api.post("/api/inventory/items", { name })).body as { id: number };

/** Sends a file as the browser does: the PDF itself as the body, its name in the address. */
async function upload(itemId: number, name: string, body: Buffer | string, person: Person = ADMIN, type = "application/pdf") {
  const cookie = await cookieFor((await createUser(person)).id);
  const response = await api.app.inject({
    method: "POST", url: `/api/inventory/items/${itemId}/datasheets?name=${encodeURIComponent(name)}`,
    headers: { cookie, "content-type": type }, payload: body,
  });
  return { status: response.statusCode, body: response.body ? response.json() : null };
}
const detail = async (itemId: number) => (await api.get(`/api/inventory/items/${itemId}`)).body;

describe("data sheets", () => {
  it("keeps the PDFs of an item, and the page of the item lists them without their bytes", async () => {
    const item = await makeItem();
    const first = await upload(item.id, "Epoxy safety sheet", pdf("one"));
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ name: "Epoxy safety sheet", itemId: item.id, sizeBytes: pdf("one").length });
    await upload(item.id, "Mixing table.pdf", pdf("two"));

    const { datasheets } = await detail(item.id);
    expect(datasheets.map((d: { name: string }) => d.name)).toEqual(["Epoxy safety sheet", "Mixing table.pdf"]);
    expect(datasheets[0]).toMatchObject({ sizeBytes: pdf("one").length, uploadedBy: "admin" });
    expect(JSON.stringify(datasheets)).not.toContain("%PDF"); // the bytes are not in the list
    expect(Object.keys(datasheets[0]).sort()).toEqual(["id", "name", "sizeBytes", "uploadedAt", "uploadedBy"]);
  });

  it("gives the file back exactly, only when it is asked for", async () => {
    const item = await makeItem();
    const sent = pdf("the real content");
    const { body } = await upload(item.id, "Spec", sent);
    const response = await api.app.inject({ method: "GET", url: `/api/inventory/datasheets/${body.id}`, headers: { cookie: await cookieFor((await createUser(ADMIN)).id) } });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.headers["content-disposition"]).toBe("inline; filename*=UTF-8''Spec.pdf");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["content-security-policy"]).not.toContain("default-src"); // a PDF viewer would be refused by it
    expect(response.rawPayload.equals(sent)).toBe(true);
    expect((await api.get(`/api/inventory/datasheets/${body.id + 99}`)).status).toBe(404);
  });

  it("refuses what is not a PDF whatever it is called, what is empty, what is too big, and a missing name", async () => {
    const item = await makeItem();
    expect((await upload(item.id, "Notes", "just some text")).status).toBe(400); // wrong first bytes
    expect((await upload(item.id, "Notes", "<html>%PDF-</html>")).body.error).toMatch(/not a PDF/);
    expect((await upload(item.id, "Empty", Buffer.alloc(0))).status).toBe(400);
    const big = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(10_000_001)]);
    expect((await upload(item.id, "Big", big)).status).toBeGreaterThanOrEqual(400);
    const cookie = await cookieFor((await createUser(ADMIN)).id);
    const noName = await api.app.inject({ method: "POST", url: `/api/inventory/items/${item.id}/datasheets`, headers: { cookie, "content-type": "application/pdf" }, payload: pdf() });
    expect(noName.statusCode).toBe(400);
    expect((await upload(item.id, "As a picture", pdf(), ADMIN, "image/png")).status).toBeGreaterThanOrEqual(400);
    expect((await detail(item.id)).datasheets).toEqual([]); // nothing was kept
  });

  it("says no to an item that does not exist, and to somebody who may not change the inventory", async () => {
    const item = await makeItem();
    expect((await upload(99_999, "Spec", pdf())).status).toBe(404);
    expect((await upload(item.id, "Spec", pdf(), viewer)).status).toBe(403);
    const { body } = await upload(item.id, "Spec", pdf(), pm); // a project manager keeps the inventory
    expect(body.name).toBe("Spec");
    // everybody who is signed in may read it, only those who keep the inventory may remove it
    expect((await api.as(viewer).get(`/api/inventory/datasheets/${body.id}`)).status).toBe(200);
    expect((await api.as(viewer).del(`/api/inventory/datasheets/${body.id}`)).status).toBe(403);
  });

  it("removes a PDF, and its file with it", async () => {
    const item = await makeItem();
    const { body } = await upload(item.id, "Spec", pdf());
    expect((await api.del(`/api/inventory/datasheets/${body.id}`)).status).toBe(204);
    expect((await api.get(`/api/inventory/datasheets/${body.id}`)).status).toBe(404);
    expect((await api.del(`/api/inventory/datasheets/${body.id}`)).status).toBe(404);
    expect((await detail(item.id)).datasheets).toEqual([]);
  });

  it("goes with the item when it is deleted", async () => {
    const item = await makeItem();
    const { body } = await upload(item.id, "Spec", pdf());
    expect((await api.del(`/api/inventory/items/${item.id}`)).status).toBe(204);
    expect((await api.get(`/api/inventory/datasheets/${body.id}`)).status).toBe(404);
  });

  it("is in the history by name, never by content", async () => {
    const item = await makeItem();
    await upload(item.id, "Secret-ish sheet", pdf("must not be logged"));
    const history = (await api.get("/api/audit?table=item_datasheet")).body;
    const text = JSON.stringify(history);
    expect(text).toContain("Secret-ish sheet");
    expect(text).not.toContain("must not be logged");
  });
});
