import { defineConfig } from "vitest/config";
import { testUrl } from "./test/db-urls.ts";

export default defineConfig({
  test: {
    globalSetup: ["./test/global-setup.ts"],
    env: { DATABASE_URL: testUrl, NODE_ENV: "test" },
    // All test files share one database, so they must not run at the same time.
    fileParallelism: false,
  },
});
