import "@fastify/cookie";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuthConfig } from "../../core/auth-config";
import { AppError, notFound } from "../../core/errors";
import { loadUser, loginWithIdentity } from "../users/users.service";
import { userStorage } from "./auth.context";
import { getCurrentUser, permissionsOf, type User } from "./auth.service";
import { newLoginAttempt, type GoogleClient } from "./google";
import { SESSION_HOURS, signLoginState, signSessionToken, verifyLoginState, verifySessionToken } from "./tokens";

export const SESSION_COOKIE = "erp_token";
/** What the sign-in page can be told when Google sign-in did not work (`/?login_error=<word>`). */
type LoginProblem = "cancelled" | "expired" | "domain" | "deactivated" | "failed";
const LOGIN_COOKIE = "erp_login";

/** The only API paths that do not need a signed-in user. */
const PUBLIC_PATHS = new Set([
  "/api/health",
  "/api/auth/config",
  "/api/auth/login",
  "/api/auth/callback",
  "/api/auth/dev-login",
  "/api/auth/logout",
]);

async function userOf(request: FastifyRequest, config: AuthConfig): Promise<User | null> {
  const token = request.cookies[SESSION_COOKIE];
  if (!token) return null;
  const id = await verifySessionToken(token, config.jwtSecret);
  // The role, the areas and the "active" flag are read from the database on every request:
  // deactivating someone or changing their role takes effect immediately, token or not.
  return id === null ? null : loadUser(id);
}

/**
 * A request that changes data must come from our own pages, not from another site. The browser
 * says where the page is from (Origin): it must be the public address of the app, or the host the
 * request was sent to. Behind a proxy the Host header is often rewritten, so PUBLIC_URL is the
 * reference that does not depend on how the proxy is set up.
 */
function fromOurOrigin(request: FastifyRequest, config: AuthConfig): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
  const origin = request.headers.origin;
  if (!origin) return true; // not a browser (curl, tests): cookies cannot be abused from there
  try {
    const { host } = new URL(origin);
    return host === config.publicUrl.host || host === request.headers.host;
  } catch {
    return false;
  }
}

/**
 * Runs before every route: refuses cross-site writes, and for every non-public path finds the
 * signed-in user and makes it available to the services through getCurrentUser().
 */
export function addAuthHook(app: FastifyInstance, config: AuthConfig) {
  app.addHook("onRequest", (request, reply, done) => {
    if (!fromOurOrigin(request, config)) {
      void reply.code(403).send({ error: "Cross-site request refused" });
      return;
    }
    if (PUBLIC_PATHS.has(request.url.split("?")[0] ?? "")) {
      done();
      return;
    }
    userOf(request, config).then(
      (user) => {
        if (!user) {
          void reply.code(401).send({ error: "Not signed in" });
          return;
        }
        userStorage.run(user, done); // everything after this hook runs "as" that user
      },
      (error) => done(error),
    );
  });
}

export interface AuthOptions {
  config: AuthConfig;
  /** Null when Google is not configured (development without credentials). */
  google: GoogleClient | null;
}

export async function authRoutes(app: FastifyInstance, { config, google }: AuthOptions) {
  const cookieOptions = (path: string, maxAgeSeconds: number) => ({
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: "lax" as const, // "lax" so the cookie survives the redirect back from Google
    path,
    maxAge: maxAgeSeconds,
  });

  async function startSession(reply: FastifyReply, user: User) {
    const token = await signSessionToken(user.id, config.jwtSecret);
    reply.setCookie(SESSION_COOKIE, token, cookieOptions("/api", SESSION_HOURS * 3600));
  }

  /** Tells the sign-in page which ways of signing in exist. */
  app.get("/auth/config", () => ({
    google: google !== null,
    devLogin: config.devLoginEmail !== undefined,
    domain: config.google?.allowedDomain ?? null,
  }));

  app.get("/auth/login", async (_request, reply) => {
    if (!google) throw new AppError(503, "Google login is not configured");
    const { state, verifier, challenge } = newLoginAttempt();
    reply.setCookie(LOGIN_COOKIE, await signLoginState({ state, verifier }, config.jwtSecret), cookieOptions("/api/auth", 600));
    return reply.redirect(google.authorizeUrl({ state, challenge }));
  });

  app.get("/auth/callback", async (request, reply) => {
    const query = z
      .object({ code: z.string().optional(), state: z.string().optional(), error: z.string().optional() })
      .parse(request.query);
    // Only a fixed word goes back to the page, which words it itself: never text taken from the
    // request or from Google, so a crafted link cannot put a message of its own on our page.
    const back = (problem: LoginProblem) => reply.redirect(`/?login_error=${problem}`);

    try {
      if (!google || query.error || !query.code || !query.state) return back("cancelled");
      const saved = await verifyLoginState(request.cookies[LOGIN_COOKIE] ?? "", config.jwtSecret);
      if (!saved || saved.state !== query.state) return back("expired");

      const identity = await google.identify({ code: query.code, verifier: saved.verifier });
      const user = await loginWithIdentity(identity, config.adminEmails);
      reply.clearCookie(LOGIN_COOKIE, { path: "/api/auth" });
      await startSession(reply, user);
      return reply.redirect("/");
    } catch (error) {
      if (error instanceof AppError && (error.code === "domain" || error.code === "deactivated")) return back(error.code);
      request.log.error(error);
      return back("failed");
    }
  });

  /** Development only: sign in as DEV_LOGIN_EMAIL without Google. Absent when the variable is not set. */
  app.get("/auth/dev-login", async (_request, reply) => {
    if (!config.devLoginEmail) throw notFound("Page");
    const user = await loginWithIdentity({ email: config.devLoginEmail, name: "Developer" }, config.adminEmails);
    await startSession(reply, user);
    return reply.redirect("/");
  });

  /** The token cannot be revoked (it is not stored anywhere): signing out forgets it in this browser. */
  app.post("/auth/logout", async (_request, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: "/api" });
    return reply.code(204).send();
  });

  app.get("/me", async () => {
    const user = await getCurrentUser();
    return { ...user, permissions: permissionsOf(user) };
  });
}
