import { eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { db, pool } from "../src/db/client";
import { fund } from "../src/db/schema";

export interface Reply {
  status: number;
  body: any;
}

/** An app plus a tiny JSON client, and the cleanup every test file needs. */
export function testApp() {
  const app: FastifyInstance = buildApp();

  async function call(method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", url: string, body?: unknown): Promise<Reply> {
    const response = await app.inject({
      method,
      url,
      ...(body === undefined ? {} : { payload: body as object }),
    });
    return { status: response.statusCode, body: response.body ? response.json() : null };
  }

  return {
    get: (url: string) => call("GET", url),
    post: (url: string, body: unknown) => call("POST", url, body),
    patch: (url: string, body: unknown) => call("PATCH", url, body),
    put: (url: string, body: unknown) => call("PUT", url, body),
    del: (url: string) => call("DELETE", url),
    async close() {
      await app.close();
      await pool.end();
    },
  };
}

/** Empties everything a test can create, keeping the seed (season, areas, team fund). */
export async function resetData() {
  await db.execute(
    sql`truncate table line_figures, budget_line, project, fund_contract, team_inflow, bank_snapshot, supplier restart identity cascade`,
  );
  await db.delete(fund).where(eq(fund.kind, "external"));
}
