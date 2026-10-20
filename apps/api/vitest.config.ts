import { defineConfig } from "vitest/config";
import { testOwnerUrl, testUrl } from "./test/db-urls.ts";

export default defineConfig({
  test: {
    globalSetup: ["./test/global-setup.ts"],
    env: {
      // the API's limited user; the owner is only for what a test must do beyond it (emptying tables)
      DATABASE_URL: testUrl,
      DATABASE_OWNER_URL: testOwnerUrl,
      NODE_ENV: "test",
      JWT_SECRET: "test-secret-test-secret-test-secret-123456",
      PUBLIC_URL: "http://localhost:5173",
      ADMIN_EMAILS: "boss@team.test",
    },
    // All test files share one database, so they must not run at the same time.
    fileParallelism: false,
  },
});
