import { sql } from "drizzle-orm";
import type { db as Db } from "./client";

type Database = typeof Db;

/**
 * Makes (or updates) the database user the API connects as, and gives it only what it needs:
 * read and write the data tables, read the history, nothing else. It cannot create, alter or drop
 * anything, cannot switch the audit trigger off and cannot write `audit_log` (the trigger does,
 * with the owner's rights, see migration 0003). So the API's credentials are worth much less
 * than the owner's if they ever leak.
 *
 * Repeatable: run it after every migration; it also sets the password, so it is how the
 * password is rotated. The name and password are passed as parameters and quoted by the
 * database itself (format %I and %L), never pasted into the text.
 */
export async function ensureAppRole(owner: Database, role: string, password: string) {
  await owner.transaction(async (tx) => {
    await tx.execute(sql`select set_config('erp.app_role', ${role}, true), set_config('erp.app_password', ${password}, true)`);
    await tx.execute(sql`
      do $$
      declare
        app text := current_setting('erp.app_role');
        secret text := current_setting('erp.app_password');
      begin
        if exists (select 1 from pg_roles where rolname = app) then
          execute format('alter role %I with login nosuperuser nocreatedb nocreaterole password %L', app, secret);
        else
          execute format('create role %I with login nosuperuser nocreatedb nocreaterole password %L', app, secret);
        end if;
        execute format('grant usage on schema public to %I', app);
        execute format('grant select, insert, update, delete on all tables in schema public to %I', app);
        -- tables created by later migrations get the same rights
        execute format('alter default privileges in schema public grant select, insert, update, delete on tables to %I', app);
        -- the history can be read, never written with the API's own credentials
        if to_regclass('public.audit_log') is not null then
          execute format('revoke insert, update, delete on public.audit_log from %I', app);
        end if;
      end
      $$
    `);
  });
}

/** Stops the API in production if it was given the owner's (or any superuser's) credentials. */
export async function assertNotSuperuser(db: Database) {
  const result = await db.execute(sql`select rolsuper from pg_roles where rolname = current_user`);
  if ((result.rows[0] as { rolsuper?: boolean } | undefined)?.rolsuper) {
    throw new Error(
      "The API is connected to the database as a superuser. Use the API's own user, created by `pnpm db:roles` (see docs/produzione.md).",
    );
  }
}
