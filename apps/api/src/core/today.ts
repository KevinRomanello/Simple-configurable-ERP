/** Today as YYYY-MM-DD on the team's clock. The calculation engine never reads the clock: the API gives it the day. */
export function today(now = new Date()): string {
  // HARDCODED: the team's time zone, a setting if a team is ever outside Italy.
  const zone = "Europe/Rome";
  // the Canadian locale writes dates as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(now);
}
