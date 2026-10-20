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
    /** Signs the session token. Changing it signs everybody out at once. */
    JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
    /** The address people type, without a trailing path: where Google sends them back. */
    PUBLIC_URL: z.url(),
    /** Emails that are always admin (the first admin; the way back in if everybody was demoted). */
    ADMIN_EMAILS: emails,
    /** Development only: sign in as this email without Google. */
    DEV_LOGIN_EMAIL: optional(z.email()),
    GOOGLE_CLIENT_ID: optional(z.string()),
    GOOGLE_CLIENT_SECRET: optional(z.string()),
    /** Only accounts of this Google Workspace domain may sign in, e.g. "example.org". */
    GOOGLE_ALLOWED_DOMAIN: optional(z.string()),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;
    const problem = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if (env.DEV_LOGIN_EMAIL) problem("DEV_LOGIN_EMAIL", "The developer login must not exist in production");
    if (!env.PUBLIC_URL.startsWith("https://")) problem("PUBLIC_URL", "Production must use https");
    for (const key of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_ALLOWED_DOMAIN"] as const) {
      if (!env[key]) problem(key, "Required in production");
    }
  });

export interface AuthConfig {
  isProduction: boolean;
  jwtSecret: Uint8Array;
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
    jwtSecret: new TextEncoder().encode(env.JWT_SECRET),
    publicUrl,
    secureCookies: publicUrl.protocol === "https:",
    adminEmails: env.ADMIN_EMAILS,
    devLoginEmail: env.DEV_LOGIN_EMAIL?.toLowerCase(),
    google,
  };
}
