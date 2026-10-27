import { z } from "zod";

const email = z.email().max(254);

/**
 * The email the login proxy put in its header: exactly one valid address, in lower case, or null
 * (missing, malformed, or sent twice: a header sent twice reaches us as "a@x.org, b@x.org").
 */
export function emailFromHeader(value: string | string[] | undefined): string | null {
  if (typeof value !== "string") return null;
  const parsed = email.safeParse(value.trim());
  return parsed.success ? parsed.data.toLowerCase() : null;
}

/** "mario.rossi@team.org" → "Mario Rossi": the proxy sends the email only, so the name is a guess from it. */
export function nameFromEmail(address: string): string {
  const local = address.split("@")[0] ?? address;
  const words = local.split(/[._+-]+/).filter(Boolean);
  return (words.length > 0 ? words : [local]).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}
