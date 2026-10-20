import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import * as schema from "../src/db/schema";
import { seedBase } from "../src/db/seed-base";
import { adminUrl, testUrl } from "./db-urls";

// Runs once before the whole test suite: fresh database, migrations, base data.
export default async function setup() {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query("drop database if exists erp_test with (force)");
  await admin.query("create database erp_test");
  await admin.end();

  const pool = new pg.Pool({ connectionString: testUrl });
  const db = drizzle(pool, { schema, casing: "snake_case" });
  await migrate(db, { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
  await seedBase(db);
  await pool.end();
}
