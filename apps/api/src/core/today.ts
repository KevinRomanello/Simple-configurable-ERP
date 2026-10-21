/** Today as YYYY-MM-DD (UTC). The calculation engine never reads the clock: the API gives it the day. */
export const today = () => new Date().toISOString().slice(0, 10);
