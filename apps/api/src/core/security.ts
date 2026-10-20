import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance, FastifyRequest } from "fastify";

/** How many requests one address may make per minute. */
export interface RateLimits {
  /** the whole API: generous, a page reloads about ten queries after every edit */
  api: number;
  /** the sign-in routes: strict, a person signs in a few times a day at most */
  signIn: number;
}

export const DEFAULT_RATE_LIMITS: RateLimits = { api: 1200, signIn: 10 };

const path = (request: FastifyRequest) => request.url.split("?")[0];
const isSignIn = (request: FastifyRequest) =>
  ["/api/auth/login", "/api/auth/callback", "/api/auth/dev-login"].includes(path(request) ?? "");

/**
 * Protections that apply to every answer of the API. Register it before the routes.
 *
 * - Security headers (helmet): the API only ever answers with JSON or a redirect, so nothing
 *   needs to be loaded from it and nobody may put it in a frame.
 * - `Cache-Control: no-store`: budget data must not stay in a browser or proxy cache.
 * - Rate limit per address, kept in memory (one API process; a restart resets the counters).
 *   The health check is never limited. Behind a reverse proxy the real address is only known
 *   when `trustProxy` is on (TRUST_PROXY), otherwise everybody looks like the proxy.
 */
export function addSecurity(app: FastifyInstance, limits: RateLimits | false) {
  app.register(helmet, {
    contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
  });
  app.addHook("onSend", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
  });

  if (!limits) return;
  app.register(rateLimit, {
    timeWindow: "1 minute",
    max: (request) => (isSignIn(request) ? limits.signIn : limits.api),
    // the sign-in routes count apart from the rest
    keyGenerator: (request) => (isSignIn(request) ? `${request.ip}:sign-in` : request.ip),
    allowList: (request) => path(request) === "/api/health",
    // thrown, so the app's error handler words the answer like every other error: { error: "..." }
    errorResponseBuilder: () =>
      Object.assign(new Error("Too many requests: wait a minute and try again"), { statusCode: 429 }),
  });
}
