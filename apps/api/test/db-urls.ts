// Tests run against their own database, recreated from scratch on every run, so they can never
// touch development data. It lives on the same Postgres server as the development database.
const developmentUrl =
  process.env.DATABASE_URL ?? "postgres://erp:erp_dev_password@localhost:5432/erp";

export const adminUrl = developmentUrl;

const test = new URL(developmentUrl);
test.pathname = "/erp_test";
export const testUrl = test.toString();
