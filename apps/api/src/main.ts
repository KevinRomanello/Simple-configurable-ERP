import { buildApp } from "./app";
import { env } from "./core/env";
import { pool } from "./db/client";

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
