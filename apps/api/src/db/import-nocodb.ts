import { asc, eq } from "drizzle-orm";
import { userStorage } from "../modules/auth/auth.context";
import { importFromNocodb } from "../modules/registry/nocodb";
import { loadUser } from "../modules/users/users.service";
import { db, pool } from "./client";
import { appUser } from "./schema";

// Brings bases of NocoDB into the registry (docs/anagrafiche.md, §13bis). NocoDB is only read. Without --apply it
// only says what it would do. The token of NocoDB is read from NOCODB_TOKEN, so it is not left in the history of
// the shell.
//
//   NOCODB_TOKEN=… pnpm exec tsx src/db/import-nocodb.ts --url https://nocodb.example.org --base p1abc,p2def [--section "HR"] [--apply]

const arg = (name: string) => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : undefined;
};
const url = arg("url");
const bases = arg("base")?.split(",").map((b) => b.trim()).filter(Boolean) ?? [];
const token = process.env.NOCODB_TOKEN;
if (!url || bases.length === 0 || !token) {
  console.error("Usage: NOCODB_TOKEN=<token of NocoDB> import-nocodb.ts --url <address of NocoDB> --base <base id>[,<base id>] [--section <menu section>] [--apply]");
  process.exit(1);
}

const [first] = await db.select().from(appUser).where(eq(appUser.role, "admin")).orderBy(asc(appUser.id)).limit(1);
const admin = first ? await loadUser(first.id) : null;
if (!admin) throw new Error("There is no active admin to import as: sign in once first");

const report = await userStorage.run(admin, () =>
  importFromNocodb({ url, token, baseIds: bases, apply: process.argv.includes("--apply"), section: arg("section"), log: (line) => console.log(line) }),
);
console.log(report.applied ? "Done." : "Nothing was written (add --apply to bring them over).");
console.log(`${report.tables.length} tables, ${report.tables.reduce((s, t) => s + t.records, 0)} records, ${report.warnings.length} warnings.`);
await pool.end();
