import { afterAll, describe, expect, it } from "vitest";
import { testApp } from "../../../test/helpers";

const api = testApp();

afterAll(() => api.close());

describe("health", () => {
  it("reports the database as reachable, without signing in", async () => {
    const { status, body } = await api.anonymous().get("/api/health");
    expect({ status, body }).toEqual({ status: 200, body: { ok: true, db: true } });
  });
});

describe("lookups", () => {
  it("serves the hardcoded lists", async () => {
    expect((await api.get("/api/lookups/categories")).body).toHaveLength(7);
    expect((await api.get("/api/lookups/priorities")).body).toEqual(["High", "Medium", "Low"]);
    expect((await api.get("/api/lookups/vat-rates")).body).toEqual([0, 11, 22]);
  });

  it("serves the VAT deadline rules", async () => {
    const { body } = await api.get("/api/lookups/vat-rules");
    expect(body.shiftWeekendToMonday).toBe(true);
    expect(body.deadlines).toHaveLength(4);
  });

  it("serves the settings that mirror the old script", async () => {
    const { body } = await api.get("/api/lookups/settings");
    expect(body.vatBaseWhenTotalSponsor).toBe("net");
    expect(body.bankCompare).toEqual({ summary: "day", timeline: "month" });
  });

  it("finds the seeded season", async () => {
    const { status, body } = await api.get("/api/seasons/current");
    expect(status).toBe(200);
    expect(body.name).toBe("2026-2027");
  });
});
