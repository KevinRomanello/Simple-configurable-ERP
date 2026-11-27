import cookie from "@fastify/cookie";
import Fastify from "fastify";
import { ZodError } from "zod";
import { loadAuthConfig, type AuthConfig } from "./core/auth-config";
import { env } from "./core/env";
import { AppError, badValueMessage, postgresCode, retryMessage } from "./core/errors";
import { addSecurity, DEFAULT_RATE_LIMITS, type RateLimits } from "./core/security";
// what the modules answer to the core and hear from it: read once, at the start, in this order (the Treasury box comes before the Sponsors one, and the budget is named first in a message)
import "./modules/treasury/treasury.contract";
import "./modules/budget/budget.contract";
import "./modules/inventory/inventory.contract";
import "./bridges/treasury-budget/treasury-budget.contract";
import "./bridges/inventory-budget/inventory-budget.contract";
import { addModuleGate, appModulesRoutes } from "./platform/appmodules/appmodules.routes";
import { addAuthHook, authRoutes } from "./platform/auth/auth.routes";
import { createGoogleClient, type GoogleClient } from "./platform/auth/google";
import { areasRoutes } from "./platform/areas/areas.routes";
import { auditRoutes } from "./platform/audit/audit.routes";
import { budgetRoutes } from "./modules/budget/budget.routes";
import { cashRoutes } from "./modules/treasury/cash.routes";
import { cashflowRoutes } from "./modules/cashflow/cashflow.routes";
import { fundsRoutes } from "./modules/funds/funds.routes";
import { healthRoutes } from "./platform/health/health.routes";
import { inventoryRoutes } from "./modules/inventory/inventory.routes";
import { lookupsRoutes } from "./platform/lookups/lookups.routes";
import { addSeasonHook, seasonsRoutes } from "./platform/seasons/seasons.routes";
import { suppliersRoutes } from "./modules/suppliers/suppliers.routes";
import { usersRoutes } from "./platform/users/users.routes";
import { viewsRoutes } from "./modules/views/views.routes";
import { settingsRoutes } from "./platform/settings/settings.routes";
import { registryRoutes } from "./modules/registry/registry.routes";
import { rolesyncRoutes } from "./bridges/registry-access/rolesync.routes";
import { treasuryBudgetRoutes } from "./bridges/treasury-budget/treasury-budget.routes";
import { inventoryBudgetRoutes } from "./bridges/inventory-budget/inventory-budget.routes";

export interface AppOptions {
  /** Defaults to the values of the environment. */
  config?: AuthConfig;
  /** Defaults to the real Google when it is configured, none otherwise. Tests pass a fake. */
  google?: GoogleClient | null;
  /** Requests per minute per address; `false` turns the limit off (most tests do). */
  rateLimits?: RateLimits | false;
  /** Take the client address from X-Forwarded-For. Defaults to TRUST_PROXY. */
  trustProxy?: boolean;
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
  const app = Fastify({ logger: process.env.NODE_ENV !== "test", trustProxy: options.trustProxy ?? env.TRUST_PROXY });
  addSecurity(app, options.rateLimits ?? DEFAULT_RATE_LIMITS);
  app.register(cookie);

  // One place that turns failures into HTTP answers: expected errors keep their status,
  // bad input is a 400, anything else is logged and hidden behind a generic 500.
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.status).send({ error: error.message, ...(error.code ? { code: error.code } : {}), ...(error.details === undefined ? {} : { details: error.details }) });
    }
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: "Invalid input", issues: error.issues });
    }
    // Last line of defence for rules the services did not check first: the database says no.
    const code = postgresCode(error);
    if (code === "23505") return reply.code(409).send({ error: "This value already exists" });
    if (code === "23503") return reply.code(409).send({ error: "This item is still in use, or refers to something that does not exist" });
    if (code === "23514") return reply.code(400).send({ error: "A value is out of its allowed range" });
    const retry = retryMessage(code);
    if (retry) return reply.code(409).send({ error: retry });
    const badValue = badValueMessage(code);
    if (badValue) return reply.code(400).send({ error: badValue });
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    if (status < 500) return reply.code(status).send({ error: (error as Error).message });
    request.log.error(error);
    return reply.code(500).send({ error: "Internal error" });
  });

  app.register(
    async (api) => {
      addAuthHook(api, config); // before any route, so every route below is protected
      addSeasonHook(api); // the season chosen in the menu, for every route below
      addModuleGate(api); // the modules an admin turned off do not answer (docs/moduli.md)
      await api.register(healthRoutes);
      await api.register(authRoutes, { config, google });
      await api.register(usersRoutes);
      await api.register(auditRoutes);
      await api.register(lookupsRoutes);
      await api.register(seasonsRoutes);
      await api.register(areasRoutes);
      await api.register(budgetRoutes);
      await api.register(fundsRoutes);
      await api.register(suppliersRoutes);
      await api.register(inventoryRoutes);
      await api.register(cashflowRoutes);
      // a module and a bridge answer under their own name: /api/treasury/…, /api/treasury-budget/…, /api/inventory-budget/… (docs/moduli-architettura.md, §8)
      await api.register(cashRoutes, { prefix: "/treasury" });
      await api.register(treasuryBudgetRoutes, { prefix: "/treasury-budget" });
      await api.register(inventoryBudgetRoutes, { prefix: "/inventory-budget" });
      await api.register(viewsRoutes);
      await api.register(settingsRoutes);
      await api.register(registryRoutes);
      // a bridge answers under its own name: /api/registry-access/… (docs/moduli-architettura.md, §8)
      await api.register(rolesyncRoutes, { adminEmails: config.adminEmails, prefix: "/registry-access" });
      await api.register(appModulesRoutes);
    },
    { prefix: "/api" },
  );
  return app;
}
