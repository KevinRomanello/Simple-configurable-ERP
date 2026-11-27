// The calls to the API (docs/architettura.md): the requests, the errors, and the calls of the core and of each module live in
// their own api.ts (split from api/client.ts in G7). Every request carries the season chosen in the menu (X-Season).
import { chosenSeasonId } from "./seasonChoice";

/** An error answer of the API: carries the HTTP status so screens can react to a 409. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** More from the server about the failure: the problems of each answer of a form. */
    readonly details?: unknown,
    /** A stable word for a failure the page words itself ("sign-in-needed", "password-needed"). */
    readonly code?: string,
  ) {
    super(message);
  }
}

/** The session is missing, expired or was revoked: the person has to sign in again. */
export const isUnauthorized = (error: unknown) => error instanceof ApiError && error.status === 401;

/**
 * What to tell the person about a refused request: the server's sentence and, for input that did
 * not pass validation, which field and why ("amount: The value cannot be more than 1,000,000,000").
 */
export function errorMessage(payload: unknown, fallback: string): string {
  const body = payload as { error?: unknown; issues?: { path?: unknown[]; message?: unknown }[] } | null;
  const issue = body?.issues?.[0];
  const reason = typeof issue?.message === "string" ? issue.message : null;
  const field = issue?.path?.length ? `${issue.path.join(".")}: ` : "";
  if (reason) return `${field}${reason}`;
  return typeof body?.error === "string" ? body.error : fallback;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  // every request is about the season chosen in the menu; without one, the server takes today's
  const season = chosenSeasonId();
  const response = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(season === null ? {} : { "X-Season": String(season) }),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const body = payload as { details?: unknown; code?: string } | null;
    throw new ApiError(response.status, errorMessage(payload, response.statusText), body?.details, body?.code);
  }
  return payload as T;
}

export const get = <T>(path: string) => request<T>("GET", path);
export const post = <T>(path: string, body: unknown) => request<T>("POST", path, body);
export const patch = <T>(path: string, body: unknown) => request<T>("PATCH", path, body);
export const put = <T>(path: string, body: unknown) => request<T>("PUT", path, body);
export const del = (path: string) => request<void>("DELETE", path);

/** The plain JSON calls, for the modules that keep their own list of endpoints (api/registry.ts). */
export const http = { get, post, patch, put, del };

/** Sends a file as the body of a request (its type in Content-Type), and reads the JSON answer. */
export async function upload<T>(path: string, file: Blob): Promise<T> {
  const response = await fetch(`/api${path}`, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, errorMessage(payload, response.statusText));
  return payload as T;
}
