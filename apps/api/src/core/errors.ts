/** An expected failure that maps to an HTTP status (anything else is a bug and becomes a 500). */
export class AppError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new AppError(404, `${what} not found`);
export const conflict = (message: string) => new AppError(409, message);
export const invalid = (message: string) => new AppError(400, message);
export const forbidden = (message: string) => new AppError(403, message);

/** The Postgres error code behind a database failure (Drizzle wraps the driver error in `cause`). */
export function postgresCode(error: unknown): string | undefined {
  const e = error as { code?: string; cause?: { code?: string } } | null;
  return e?.cause?.code ?? e?.code;
}
