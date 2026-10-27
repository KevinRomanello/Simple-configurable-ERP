import { randomBytes } from "node:crypto";
import { z } from "zod";

// Everything the sign-in needs from the environment. Read when the API app is built (not when
// the database client is imported), so scripts such as db:migrate or db:seed do not need it.

const optional = (schema: z.ZodType<string>) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

const emails = z
  .string()
  .default("")
  .transform((list) =>
    list
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );

const schema = z
  .object({
    NODE_ENV: z.string().default("development"),
    /** Signs the session token. Changing it signs everybody out at once. Not used behind a login proxy. */
    JWT_SECRET: optional(z.string().min(32, "JWT_SECRET must be at least 32 characters")),
    /** The address people type, without a trailing path: where Google sends them back. */
    PUBLIC_URL: z.url(),
    /** Emails that are always admin (the first admin; the way back in if everybody was demoted). */
    ADMIN_EMAILS: emails,
    /**
     * The name of the header in which the organisation's login proxy puts the email of the person who
     * signed in (X-Email). When it is set, that header is the only way to be signed in: the proxy
     * is trusted, so nothing but the proxy must be able to reach the API (docs/accesso-e-storico.md).
     */
    TRUSTED_EMAIL_HEADER: optional(z.string().regex(/^[A-Za-z][A-Za-z0-9-]*$/, "must be the name of a header, such as X-Email")),
    /** Development only: sign in as this email without Google. */
    DEV_LOGIN_EMAIL: optional(z.email()),
    GOOGLE_CLIENT_ID: optional(z.string()),
    GOOGLE_CLIENT_SECRET: optional(z.string()),
    /** Only accounts of this Google Workspace domain may sign in, e.g. "example.org". */
    GOOGLE_ALLOWED_DOMAIN: optional(z.string()),
  })
  .superRefine((env, ctx) => {
    const problem = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    const google = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_ALLOWED_DOMAIN"] as const;
    if (env.TRUSTED_EMAIL_HEADER) {
      // one way in only: a second one (a Google login, a developer login) would skip the proxy's rules
      for (const key of [...google, "DEV_LOGIN_EMAIL"] as const) {
        if (env[key]) problem(key, "Not used when TRUSTED_EMAIL_HEADER is set: the login proxy signs people in");
      }
    } else if (!env.JWT_SECRET) {
      problem("JWT_SECRET", "Required: at least 32 characters");
    }
    if (env.NODE_ENV !== "production") return;
    if (env.DEV_LOGIN_EMAIL) problem("DEV_LOGIN_EMAIL", "The developer login must not exist in production");
    if (!env.PUBLIC_URL.startsWith("https://")) problem("PUBLIC_URL", "Production must use https");
    if (!env.TRUSTED_EMAIL_HEADER) {
      for (const key of google) if (!env[key]) problem(key, "Required in production");
    }
  });

export interface AuthConfig {
  isProduction: boolean;
  /** Signs the session cookie. Behind a login proxy there is none: a throwaway value nobody can use. */
  jwtSecret: Uint8Array;
  /** The header (lower case) in which the login proxy sends the email; undefined = no proxy. */
  emailHeader: string | undefined;
  publicUrl: URL;
  /** Cookies are marked Secure only when the site is served over https. */
  secureCookies: boolean;
  adminEmails: string[];
  devLoginEmail: string | undefined;
  google: { clientId: string; clientSecret: string; allowedDomain: string } | undefined;
}

export function loadAuthConfig(source: Record<string, string | undefined> = process.env): AuthConfig {
  const env = schema.parse(source);
  const publicUrl = new URL(env.PUBLIC_URL);
  const google =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_ALLOWED_DOMAIN
      ? {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          allowedDomain: env.GOOGLE_ALLOWED_DOMAIN.toLowerCase(),
        }
      : undefined;
  return {
    isProduction: env.NODE_ENV === "production",
    jwtSecret: new TextEncoder().encode(env.JWT_SECRET ?? randomBytes(32).toString("hex")),
    emailHeader: env.TRUSTED_EMAIL_HEADER?.toLowerCase(),
    publicUrl,
    secureCookies: publicUrl.protocol === "https:",
    adminEmails: env.ADMIN_EMAILS,
    devLoginEmail: env.DEV_LOGIN_EMAIL?.toLowerCase(),
    google,
  };
}
