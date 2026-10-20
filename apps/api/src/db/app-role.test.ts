import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { testOwnerUrl } from "../../test/db-urls";
import { postgresCode } from "../core/errors";
import { assertNotSuperuser, ensureAppRole } from "./app-role";
import { db } from "./client";
import * as schema from "./schema";
import { auditLog, supplier } from "./schema";

// The whole suite already runs as the API's limited user (see test/db-urls.ts); these tests say
// exactly what that user can and cannot do.

const ownerPool = new pg.Pool({ connectionString: testOwnerUrl });
const owner = drizzle(ownerPool, { schema, casing: "snake_case" });
afterAll(() => ownerPool.end());

/** The database refuses with "insufficient privilege" (42501). */
async function refused(statement: Promise<unknown>) {
  const error = await statement.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, "the database should have refused").not.toBeNull();
  expect(postgresCode(error)).toBe("42501");
}

describe("the user the API connects as", () => {
  it("is an ordinary user: no superuser, no creating databases or roles", async () => {
    const result = await db.execute(
      sql`select rolsuper, rolcreatedb, rolcreaterole from pg_roles where rolname = current_user`,
    );
    expect(result.rows[0]).toEqual({ rolsuper: false, rolcreatedb: false, rolcreaterole: false });
  });

  it("reads and writes the data", async () => {
    const [created] = await db.insert(supplier).values({ name: "Role probe" }).returning();
    await db.update(supplier).set({ name: "Role probe 2" });
    await db.delete(supplier);
    expect(created?.name).toBe("Role probe");
  });

  it("reads the history but cannot write it, not even to cover its tracks", async () => {
    await db.insert(supplier).values({ name: "Seen by the trigger" });
    const rows = await db.select().from(auditLog);
    expect(rows.some((r) => r.tableName === "supplier" && r.action === "insert")).toBe(true); // the trigger wrote it

    await refused(db.execute(sql`insert into audit_log (table_name, row_id, action) values ('supplier', 1, 'insert')`));
    await refused(db.execute(sql`update audit_log set actor_id = null`));
    await refused(db.execute(sql`delete from audit_log`));
    await refused(db.execute(sql`truncate audit_log`));
    await db.delete(supplier); // leave the table as it was
  });

  it("cannot change the structure or switch the history off", async () => {
    await refused(db.execute(sql`drop table supplier`));
    await refused(db.execute(sql`alter table supplier add column probe integer`));
    await refused(db.execute(sql`create table probe (id integer)`));
    await refused(db.execute(sql`truncate supplier`));
    await refused(db.execute(sql`alter table supplier disable trigger audit_supplier`));
    await refused(db.execute(sql`drop function audit_row() cascade`));
    await refused(db.execute(sql`create or replace function audit_row() returns trigger as $$ begin return null; end $$ language plpgsql`));
  });

  it("cannot see which migrations ran", async () => {
    await refused(db.execute(sql`select * from drizzle.__drizzle_migrations`));
  });
});

describe("assertNotSuperuser", () => {
  it("lets the API's own user through and refuses a superuser", async () => {
    await expect(assertNotSuperuser(db)).resolves.toBeUndefined();
    await expect(assertNotSuperuser(owner)).rejects.toThrow(/superuser/);
  });
});

describe("ensureAppRole", () => {
  const role = "erp_app_probe";
  const connectAs = async (password: string) => {
    const url = new URL(testOwnerUrl);
    url.username = role;
    url.password = password;
    const client = new pg.Client({ connectionString: url.toString() });
    await client.connect();
    return client;
  };
  const dropProbe = async () => {
    await ownerPool.query("drop owned by erp_app_probe");
    await ownerPool.query("drop role if exists erp_app_probe");
  };

  it("creates the user, can be repeated, and changes the password when asked", async () => {
    try {
      await ensureAppRole(owner, role, "first-password");
      await ensureAppRole(owner, role, "first-password"); // repeating changes nothing
      await (await connectAs("first-password")).end();

      await ensureAppRole(owner, role, "second-password");
      await (await connectAs("second-password")).end();
      await expect(connectAs("first-password")).rejects.toThrow(/password authentication failed/);
    } finally {
      await dropProbe();
    }
  });

  it("takes the name and the password as plain text, whatever they contain", async () => {
    try {
      await ensureAppRole(owner, role, "it's a \"tricky\" ; password -- $$");
      await (await connectAs("it's a \"tricky\" ; password -- $$")).end();
    } finally {
      await dropProbe();
    }
  });
});
