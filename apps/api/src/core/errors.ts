/** An expected failure that maps to an HTTP status (anything else is a bug and becomes a 500). */
export class AppError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** A stable word for the few failures the web app words itself (see the sign-in page). */
    readonly code?: string,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new AppError(404, `${what} not found`);
export const conflict = (message: string) => new AppError(409, message);
export const invalid = (message: string) => new AppError(400, message);
export const forbidden = (message: string, code?: string) => new AppError(403, message, code);

/**
 * What to tell the caller when the database refuses a value itself (a number too big, a text too
 * long, a character it cannot store, a date it cannot hold). The validation stops all of these
 * first; this is the safety net, so that a gap in it is still a 400 and never a server error.
 */
const BAD_VALUE_MESSAGES: Record<string, string> = {
  "22003": "A number is out of range",
  "22001": "A text is too long",
  "54000": "A text is too long",
  "22021": "The text contains a character that is not allowed",
  "22P05": "The text contains a character that is not allowed",
  "22007": "Not a valid date",
  "22008": "Not a valid date",
};

export const badValueMessage = (postgresErrorCode: string | undefined) => BAD_VALUE_MESSAGES[postgresErrorCode ?? ""];

/** The Postgres error code behind a database failure (Drizzle wraps the driver error in `cause`). */
export function postgresCode(error: unknown): string | undefined {
  const e = error as { code?: string; cause?: { code?: string } } | null;
  return e?.cause?.code ?? e?.code;
}
