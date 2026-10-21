/** Today, by the clock of the person using the app, as YYYY-MM-DD. */
export function todayIso(now = new Date()): string {
  const two = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}
