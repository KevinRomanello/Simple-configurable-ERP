import { env } from "../core/env";
import { ensureAppRole } from "./app-role";
import { ownerDb, ownerPool } from "./owner";

// Creates (or updates) the database user named in DATABASE_URL, with the password found there,
// connecting as the owner (DATABASE_OWNER_URL). Run it after the migrations.
const same = (a: string, b: string) => new URL(a).username === new URL(b).username;

if (!env.DATABASE_OWNER_URL) {
  throw new Error("DATABASE_OWNER_URL is not set: it is the owner of the tables, needed to create the API's user");
}
if (same(env.DATABASE_URL, env.DATABASE_OWNER_URL)) {
  throw new Error("DATABASE_URL and DATABASE_OWNER_URL use the same database user: DATABASE_URL must be the API's own user (see .env.example)");
}

const app = new URL(env.DATABASE_URL);
await ensureAppRole(ownerDb, decodeURIComponent(app.username), decodeURIComponent(app.password));
await ownerPool.end();
console.log(`Database user "${decodeURIComponent(app.username)}" is ready: it can read and write the data, nothing else.`);
