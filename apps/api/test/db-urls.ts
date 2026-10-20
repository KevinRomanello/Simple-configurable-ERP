// Tests run against their own database, recreated from scratch on every run, so they can never
// touch development data. It lives on the same Postgres server as the development database.
//
// Two users, like in production: the owner (creates the database and the tables, empties them
// between tests) and the API's own user `erp_app_test`, which is the one the whole suite runs as.
// So every test also proves that the API works with the limited rights it gets in production.
const ownerSource =
  process.env.DATABASE_OWNER_URL ?? process.env.DATABASE_URL ?? "postgres://erp:erp_dev_password@localhost:5432/erp";

/** The server as the owner, to create and drop the test database. */
export const adminUrl = ownerSource;

export const TEST_APP_USER = { name: "erp_app_test", password: "erp_app_test_password" };

function testDatabase(user?: { name: string; password: string }) {
  const url = new URL(ownerSource);
  url.pathname = "/erp_test";
  if (user) {
    url.username = user.name;
    url.password = user.password;
  }
  return url.toString();
}

export const testOwnerUrl = testDatabase();
export const testUrl = testDatabase(TEST_APP_USER);
