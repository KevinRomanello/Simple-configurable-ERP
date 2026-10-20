-- The audit trigger now runs with the rights of the user who owns it (the owner of the tables),
-- not of whoever changes the data. So the API's database user needs no write access to audit_log
-- at all (see src/db/app-role.ts): the history cannot be edited with the credentials the API
-- uses. The search_path is fixed because a SECURITY DEFINER function must not depend on the
-- settings of whoever calls it.
ALTER FUNCTION audit_row() SECURITY DEFINER;
--> statement-breakpoint
ALTER FUNCTION audit_row() SET search_path = public, pg_temp;
