import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { ensureAppRole } from "../src/db/app-role";
import * as schema from "../src/db/schema";
import { seedBase } from "../src/db/seed-base";
import { adminUrl, TEST_APP_USER, testOwnerUrl } from "./db-urls";

// Runs once before the whole test suite: fresh database, migrations, the API's limited user,
// base data. All as the owner; the tests themselves run as the limited user.
export default async function setup() {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query("drop database if exists erp_test with (force)");
  await admin.query("create database erp_test");
  await admin.end();

  const pool = new pg.Pool({ connectionString: testOwnerUrl });
  const db = drizzle(pool, { schema, casing: "snake_case" });
  await migrate(db, { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
  await ensureAppRole(db, TEST_APP_USER.name, TEST_APP_USER.password);
  await seedBase(db);
  await pool.end();
}
