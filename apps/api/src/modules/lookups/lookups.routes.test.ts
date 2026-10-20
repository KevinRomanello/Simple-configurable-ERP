import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app";
import { pool } from "../../db/client";

const app = buildApp();

afterAll(async () => {
  await app.close();
  await pool.end();
});

async function get(url: string) {
  const response = await app.inject({ method: "GET", url });
  return { status: response.statusCode, body: response.json() };
}

describe("health", () => {
  it("reports the database as reachable", async () => {
    expect(await get("/api/health")).toEqual({ status: 200, body: { ok: true, db: true } });
  });
});

describe("lookups", () => {
  it("serves the hardcoded lists", async () => {
    expect((await get("/api/lookups/categories")).body).toHaveLength(7);
    expect((await get("/api/lookups/priorities")).body).toEqual(["High", "Medium", "Low"]);
    expect((await get("/api/lookups/vat-rates")).body).toEqual([0, 11, 22]);
  });

  it("serves the VAT deadline rules", async () => {
    const { body } = await get("/api/lookups/vat-rules");
    expect(body.shiftWeekendToMonday).toBe(true);
    expect(body.deadlines).toHaveLength(4);
  });

  it("serves the settings that mirror the old script", async () => {
    const { body } = await get("/api/lookups/settings");
    expect(body.vatBaseWhenTotalSponsor).toBe("net");
    expect(body.bankCompare).toEqual({ summary: "day", timeline: "month" });
  });

  it("finds the seeded season", async () => {
    const { status, body } = await get("/api/seasons/current");
    expect(status).toBe(200);
    expect(body.name).toBe("2026-2027");
  });
});

describe("me", () => {
  it("returns the hardcoded admin", async () => {
    const { body } = await get("/api/me");
    expect(body.role).toBe("admin");
  });
});
