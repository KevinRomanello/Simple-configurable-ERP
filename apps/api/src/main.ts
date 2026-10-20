import { buildApp } from "./app";
import { env } from "./core/env";
import { assertNotSuperuser } from "./db/app-role";
import { db, pool } from "./db/client";

// In production a leaked API credential must not be a leaked database: refuse to run as a superuser.
if (process.env.NODE_ENV === "production") await assertNotSuperuser(db);

const app = buildApp();

// Close the HTTP server and the database pool cleanly on container stop / Ctrl+C.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  });
}

await app.listen({ host: "0.0.0.0", port: env.PORT });
