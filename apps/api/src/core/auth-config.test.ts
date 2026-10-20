import { describe, expect, it } from "vitest";
import { loadAuthConfig } from "./auth-config";

const dev = {
  NODE_ENV: "development",
  JWT_SECRET: "x".repeat(32),
  PUBLIC_URL: "http://localhost:5173",
};
const google = {
  GOOGLE_CLIENT_ID: "id",
  GOOGLE_CLIENT_SECRET: "secret",
  GOOGLE_ALLOWED_DOMAIN: "Example.ORG",
};

describe("loadAuthConfig", () => {
  it("accepts a development setup with no Google at all", () => {
    const config = loadAuthConfig({ ...dev, DEV_LOGIN_EMAIL: "Dev@Local.test", ADMIN_EMAILS: " A@x.test, b@x.test ," });
    expect(config.google).toBeUndefined();
    expect(config.devLoginEmail).toBe("dev@local.test");
    expect(config.adminEmails).toEqual(["a@x.test", "b@x.test"]);
    expect(config.secureCookies).toBe(false);
  });

  it("treats empty variables as missing and lower-cases the domain", () => {
    expect(loadAuthConfig({ ...dev, DEV_LOGIN_EMAIL: "", GOOGLE_CLIENT_ID: "" }).google).toBeUndefined();
    expect(loadAuthConfig({ ...dev, ...google }).google?.allowedDomain).toBe("example.org");
  });

  it("refuses a short secret and a bad public address", () => {
    expect(() => loadAuthConfig({ ...dev, JWT_SECRET: "short" })).toThrow(/32 characters/);
    expect(() => loadAuthConfig({ ...dev, PUBLIC_URL: "not a url" })).toThrow();
  });

  describe("in production", () => {
    const production = { ...dev, NODE_ENV: "production", PUBLIC_URL: "https://budget.example.org", ...google };

    it("accepts a complete setup and marks cookies Secure", () => {
      const config = loadAuthConfig(production);
      expect(config.isProduction).toBe(true);
      expect(config.secureCookies).toBe(true);
    });

    it("refuses to start with the developer login enabled", () => {
      expect(() => loadAuthConfig({ ...production, DEV_LOGIN_EMAIL: "dev@local.test" })).toThrow(/developer login/);
    });

    it("requires https and all the Google settings", () => {
      expect(() => loadAuthConfig({ ...production, PUBLIC_URL: "http://budget.example.org" })).toThrow(/https/);
      expect(() => loadAuthConfig({ ...production, GOOGLE_CLIENT_SECRET: "" })).toThrow(/Required in production/);
      expect(() => loadAuthConfig({ ...production, GOOGLE_ALLOWED_DOMAIN: "" })).toThrow(/Required in production/);
    });
  });
});
