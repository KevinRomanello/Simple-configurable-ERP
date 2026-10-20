import cookie from "@fastify/cookie";
import Fastify from "fastify";
import { ZodError } from "zod";
import { loadAuthConfig, type AuthConfig } from "./core/auth-config";
import { AppError, postgresCode } from "./core/errors";
import { addAuthHook, authRoutes } from "./modules/auth/auth.routes";
import { createGoogleClient, type GoogleClient } from "./modules/auth/google";
import { auditRoutes } from "./modules/audit/audit.routes";
import { budgetRoutes } from "./modules/budget/budget.routes";
import { cashflowRoutes } from "./modules/cashflow/cashflow.routes";
import { fundsRoutes } from "./modules/funds/funds.routes";
import { healthRoutes } from "./modules/health/health.routes";
import { lookupsRoutes } from "./modules/lookups/lookups.routes";
import { seasonsRoutes } from "./modules/seasons/seasons.routes";
import { suppliersRoutes } from "./modules/suppliers/suppliers.routes";
import { usersRoutes } from "./modules/users/users.routes";
import { viewsRoutes } from "./modules/views/views.routes";

export interface AppOptions {
  /** Defaults to the values of the environment. */
  config?: AuthConfig;
  /** Defaults to the real Google when it is configured, none otherwise. Tests pass a fake. */
  google?: GoogleClient | null;
}

// Built separately from main.ts so tests can call app.inject() without opening a port.
export function buildApp(options: AppOptions = {}) {
  const config = options.config ?? loadAuthConfig();
  const google =
    options.google !== undefined
      ? options.google
      : config.google
        ? createGoogleClient({ ...config.google, redirectUri: new URL("/api/auth/callback", config.publicUrl).toString() })
        : null;
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });
  app.register(cookie);

  // One place that turns failures into HTTP answers: expected errors keep their status,
  // bad input is a 400, anything else is logged and hidden behind a generic 500.
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) return reply.code(error.status).send({ error: error.message });
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: "Invalid input", issues: error.issues });
    }
    // Last line of defence for rules the services did not check first: the database says no.
    const code = postgresCode(error);
    if (code === "23505") return reply.code(409).send({ error: "This value already exists" });
    if (code === "23503") return reply.code(409).send({ error: "This item is still in use, or refers to something that does not exist" });
    if (code === "23514") return reply.code(400).send({ error: "A value is out of its allowed range" });
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    if (status < 500) return reply.code(status).send({ error: (error as Error).message });
    request.log.error(error);
    return reply.code(500).send({ error: "Internal error" });
  });

  app.register(
    async (api) => {
      addAuthHook(api, config); // before any route, so every route below is protected
      await api.register(healthRoutes);
      await api.register(authRoutes, { config, google });
      await api.register(usersRoutes);
      await api.register(auditRoutes);
      await api.register(lookupsRoutes);
      await api.register(seasonsRoutes);
      await api.register(budgetRoutes);
      await api.register(fundsRoutes);
      await api.register(suppliersRoutes);
      await api.register(cashflowRoutes);
      await api.register(viewsRoutes);
    },
    { prefix: "/api" },
  );
  return app;
}
