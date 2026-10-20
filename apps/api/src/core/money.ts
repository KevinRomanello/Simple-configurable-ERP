// Postgres `numeric` values arrive as decimal strings. The calculation engine works with
// integers (cents, thousandths, ten-thousandths), so every conversion goes through here and
// never through floating point.

/** "12.34" -> 1234 with scale 2. Throws if the string would lose non-zero digits. */
export function toScaled(value: string | null | undefined, scale: number): number {
  if (value == null || value === "") return 0;
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) throw new Error(`Not a decimal number: ${value}`);
  const [, sign, whole, fraction = ""] = match;
  if (/[1-9]/.test(fraction.slice(scale))) {
    throw new Error(`${value} has more than ${scale} decimal places`);
  }
  const scaled = Number(whole + fraction.padEnd(scale, "0").slice(0, scale));
  return sign === "-" ? -scaled : scaled;
}

/** 1234 -> "12.34" with scale 2. */
export function fromScaled(value: number, scale: number): string {
  if (!Number.isInteger(value)) throw new Error(`Not an integer: ${value}`);
  if (scale === 0) return String(value);
  const digits = String(Math.abs(value)).padStart(scale + 1, "0");
  const text = `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
  return value < 0 ? `-${text}` : text;
}

/** Amounts of money: integer cents. */
export const toCents = (value: string | null | undefined) => toScaled(value, 2);
export const fromCents = (cents: number) => fromScaled(cents, 2);
