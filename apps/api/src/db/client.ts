import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "../core/env";
import * as schema from "./schema";

// One shared connection pool for the whole API process.
export const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
// casing must match drizzle.config.ts so queries use the same snake_case column names.
export const db = drizzle(pool, { schema, casing: "snake_case" });
