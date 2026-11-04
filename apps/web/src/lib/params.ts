import type { ParamValues, TypeParam } from "../api/types";

// What is written in the parameters of an item type (docs/inventario.md, §19). A number is typed
// as people write it ("10k", "4k7", "4,7 k", "100n", "100nF") and travels and is kept as an exact
// decimal in the unit of the parameter ("10000", "0.0000001"): the digits are moved as text,
// never through floating point.

const NBSP = " ";
const PREFIXES: Record<string, number> = { p: -12, n: -9, u: -6, µ: -6, μ: -6, m: -3, k: 3, K: 3, M: 6, G: 9 };
/** The prefixes a number is shown with, largest first. */
const SHOWN: [string, number][] = [["G", 9], ["M", 6], ["k", 3], ["", 0], ["m", -3], ["µ", -6], ["n", -9], ["p", -12]];
const LIMITS = { whole: 15, fraction: 18 };

type NumberParam = Pick<TypeParam, "unit" | "prefixes">;

/** "7.50" → "7.5", "007" → "7", "." and empty parts gone: one way of writing each number. */
function canonical(whole: string, fraction: string): string {
  const w = whole.replace(/^0+(?=\d)/, "") || "0";
  const f = fraction.replace(/0+$/, "");
  return f ? `${w}.${f}` : w;
}

/** Moves the decimal point of "4.7" by `exponent` places ("4.7", 3 → "4700"; "100", -9 → "0.0000001"). */
export function shift(decimal: string, exponent: number): string {
  const [whole = "0", fraction = ""] = decimal.split(".");
  const digits = whole + fraction;
  const point = whole.length + exponent;
  if (point <= 0) return canonical("0", "0".repeat(-point) + digits);
  if (point >= digits.length) return canonical(digits + "0".repeat(point - digits.length), "");
  return canonical(digits.slice(0, point), digits.slice(point));
}

/**
 * The number typed in a parameter, as the decimal the API keeps, or null when it is not one (or
 * has a prefix the parameter does not take). The unit may be typed after it ("100nF").
 */
export function parseNumber(text: string, param: NumberParam): string | null {
  let rest = text.trim().replace(/\s+/g, "");
  if (param.unit && rest.endsWith(param.unit) && rest.length > param.unit.length) rest = rest.slice(0, -param.unit.length);
  const negative = rest.startsWith("-");
  if (negative) rest = rest.slice(1);
  // 4.7k, 4,7k, 47, or with the prefix in place of the point as on a schematic: 4k7, 2M2
  const plain = /^(\d+)(?:[.,](\d+))?([pnuµμmkKMG])?$/.exec(rest);
  const inside = /^(\d+)([pnuµμmkKMG])(\d+)$/.exec(rest);
  const [whole, fraction, prefix] = plain ? [plain[1]!, plain[2] ?? "", plain[3]] : inside ? [inside[1]!, inside[3]!, inside[2]] : [];
  if (whole === undefined) return null;
  if (prefix !== undefined && !param.prefixes) return null;
  const value = shift(canonical(whole, fraction ?? ""), prefix === undefined ? 0 : PREFIXES[prefix]!);
  const [w = "", f = ""] = value.split(".");
  if (w.length > LIMITS.whole || f.length > LIMITS.fraction) return null;
  return negative && value !== "0" ? `-${value}` : value;
}

/** The power of ten of the first digit that is not zero ("4700" → 3, "0.0047" → -3). */
function order(abs: string): number {
  const [whole = "0", fraction = ""] = abs.split(".");
  if (whole !== "0") return whole.length - 1;
  const zeros = /^0*/.exec(fraction)![0].length;
  return zeros === fraction.length ? 0 : -(zeros + 1);
}

/** "1234567" → "1.234.567": the digits of the whole part grouped as in the rest of the app. */
const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** The number with the prefix that keeps it between 1 and 999, as [digits, prefix] ("4700" → ["4.7", "k"]). */
function scaled(value: string, param: NumberParam): [string, string] {
  const abs = value.replace("-", "");
  if (!param.prefixes) return [abs, ""];
  const [prefix, exponent] = SHOWN.find(([, e]) => e <= order(abs)) ?? SHOWN[SHOWN.length - 1]!;
  return [shift(abs, -exponent), prefix];
}

/** A number as the pages show it: "4,7 kΩ", "100 nF", "1.500 mm²". */
export function showNumber(value: string, param: NumberParam): string {
  const [digits, prefix] = scaled(value, param);
  const [whole = "0", fraction] = digits.split(".");
  const number = `${value.startsWith("-") ? "-" : ""}${group(whole)}${fraction ? `,${fraction}` : ""}`;
  const unit = `${prefix}${param.unit ?? ""}`;
  return unit ? `${number}${NBSP}${unit}` : number;
}

/** A number as the form shows it to be changed, the way it is typed: "4.7k". */
export function editNumber(value: string, param: NumberParam): string {
  const [digits, prefix] = scaled(value, param);
  return `${value.startsWith("-") ? "-" : ""}${digits}${prefix}`;
}

/** What is written in a parameter, as text ("4,7 kΩ", "0603", "yes"). */
export function showValue(param: TypeParam, value: string | boolean | undefined): string {
  if (value === undefined) return "";
  if (typeof value === "boolean") return value ? "yes" : "no";
  return param.kind === "number" ? showNumber(value, param) : value;
}

/** How a column of a parameter sorts: numbers by their value (sorting only, no sums), the rest as text. */
export function sortValue(param: TypeParam, values: ParamValues): string | number | null {
  const value = values[param.id];
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  return param.kind === "number" ? Number(value) : value;
}
