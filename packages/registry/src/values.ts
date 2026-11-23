import type { Field, FieldType } from "./types";
import { isComputed } from "./types";

// What a field accepts and how a value is kept: the same rules for the grid, the forms, the API and the
// CSV import (docs/anagrafiche.md, §4). Links and attachments are checked here for their shape only: that
// the records and files exist is checked by the API, which knows them.

export const VALUE_LIMITS = {
  text: 1_000,
  longtext: 100_000,
  email: 254,
  url: 2_000,
  json: 100_000,
  /** numbers beyond this stop being exact in JavaScript */
  number: 1e15,
  /** files a field may hold, and their size, when the field does not say */
  files: 20,
  fileMb: 10,
  firstYear: 1900,
  lastYear: 2200,
} as const;

export type Normalized = { ok: true; value: unknown } | { ok: false; error: string };

const ok = (value: unknown): Normalized => ({ ok: true, value });
const fail = (error: string): Normalized => ({ ok: false, error });

export function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

const noNul = (text: string) => !text.includes("\u0000");

function titleCase(text: string): string {
  return text.toLowerCase().replace(/(^|[\s'’\-])(\p{L})/gu, (_m, sep: string, letter: string) => sep + letter.toUpperCase());
}

function asText(raw: unknown): string | null {
  if (typeof raw === "string") return raw;
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  return null;
}

/** A real calendar day as YYYY-MM-DD within the years the registry accepts (birth dates included). */
export function isDay(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const t = Date.parse(`${text}T00:00:00Z`);
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== text) return false;
  const year = Number(text.slice(0, 4));
  return year >= VALUE_LIMITS.firstYear && year <= VALUE_LIMITS.lastYear;
}

/** Rounds half away from zero on the decimal digits as written (1.005 → 1.01), not on the binary value (1.00). */
export function roundTo(n: number, places: number, how: "round" | "floor" | "ceil" = "round"): number {
  // n × 10^p by moving the decimal point of the text, so that 1.005 stays 1.005 and not 1.00499…
  const shift = (x: number, p: number) => {
    const [mantissa, exponent = "0"] = String(x).split("e");
    return Number(`${mantissa}e${Number(exponent) + p}`);
  };
  // floor and ceil go towards minus and plus infinity, as ROUNDDOWN(-15.123, 1) = -15.2 in NocoDB
  if (how !== "round") return shift(Math[how](shift(n, places)), -places);
  return Math.sign(n) * shift(Math.round(shift(Math.abs(n), places)), -places);
}

/** "9:05", "09:05:30", "2:30 PM" as HH:MM:SS; null when it is not a time of the day. */
export function timeOfDay(text: string): string | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?$/i.exec(text.trim());
  if (!m) return null;
  let hours = Number(m[1]);
  const meridiem = m[4]?.toLowerCase().replace(/\./g, "");
  if (meridiem && (hours < 1 || hours > 12)) return null;
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  const minutes = Number(m[2]);
  const seconds = Number(m[3] ?? 0);
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, "0")).join(":");
}

/** "1:30", "1:30:15", "1:30:15.5" (hours can be many: "120:00") as seconds; a plain number is seconds. */
export function durationSeconds(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  const m = /^(\d+):(\d{1,2})(?:[:.](\d{1,2}(?:\.\d{1,3})?))?$/.exec(t);
  if (!m || Number(m[2]) > 59 || Number(m[3] ?? 0) >= 60) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0);
}

/** Seconds written in a duration format: 5400 → "1:30" (h:mm), "1:30:00" (h:mm:ss). */
export function formatDuration(seconds: number, format: string = "h:mm"): string {
  const decimals = format.includes(".") ? format.length - format.indexOf(".") - 1 : 0;
  const whole = format === "h:mm" ? Math.round(seconds / 60) * 60 : seconds;
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const minutes = `${h}:${String(m).padStart(2, "0")}`;
  if (format === "h:mm") return minutes;
  const sec = decimals > 0 ? s.toFixed(decimals).padStart(decimals + 3, "0") : String(Math.floor(s)).padStart(2, "0");
  return `${minutes}:${sec}`;
}

/** A point as NocoDB keeps it: "latitude;longitude", from that, "46.07, 11.12" or {lat, lng}. */
function geoPoint(raw: unknown): string | null {
  const pair = typeof raw === "object" && raw !== null && "lat" in raw && "lng" in raw
    ? [Number((raw as { lat: unknown }).lat), Number((raw as { lng: unknown }).lng)]
    : (asText(raw) ?? "").split(/\s*[;,]\s*/).map(Number);
  if (pair.length !== 2 || pair.some((n) => !Number.isFinite(n))) return null;
  const [lat, lng] = pair as [number, number];
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return `${roundTo(lat, 7)};${roundTo(lng, 7)}`;
}

function ids(raw: unknown, what: string): number[] | string {
  const list = Array.isArray(raw) ? raw : [raw];
  const out: number[] = [];
  for (const item of list) {
    const id = typeof item === "object" && item !== null && "id" in item ? (item as { id: unknown }).id : item;
    const n = typeof id === "string" && /^\d{1,10}$/.test(id) ? Number(id) : id;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 2_147_483_647) return `${what}: expected the ids of records`;
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

/**
 * The value to keep for `raw` in `field`, or why it cannot be kept. Empty input is null (false for a
 * checkbox). Texts are trimmed and cleaned the way the field says (lower case emails, title case names, the
 * prefix of a phone number).
 */
export function normalizeValue(field: Field, raw: unknown): Normalized {
  const o = field.options;
  if (isComputed(field.type)) return fail(`${field.name} is worked out: it cannot be written`);
  if (field.type === "checkbox") {
    if (raw === null || raw === undefined || raw === "") return ok(false);
    if (typeof raw === "boolean") return ok(raw);
    const word = String(raw).trim().toLowerCase();
    if (["true", "1", "yes", "y", "x", "si", "sì", "checked"].includes(word)) return ok(true);
    if (["false", "0", "no", "n", "unchecked"].includes(word)) return ok(false);
    return fail(`${field.name}: expected yes or no`);
  }
  if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "") || (Array.isArray(raw) && raw.length === 0)) {
    return ok(null);
  }

  switch (field.type) {
    case "text":
    case "longtext": {
      const text = asText(raw);
      if (text === null || !noNul(text)) return fail(`${field.name}: expected a text`);
      let value = field.type === "text" ? text.replace(/\s*[\r\n]+\s*/g, " ").trim() : text.replace(/\r\n/g, "\n").trim();
      const max = o.maxLength ?? VALUE_LIMITS[field.type];
      if (value.length > max) return fail(`${field.name}: at most ${max} characters`);
      if (o.transform === "lower") value = value.toLowerCase();
      if (o.transform === "upper") value = value.toUpperCase();
      if (o.transform === "title") value = titleCase(value);
      return ok(value);
    }
    case "email": {
      const text = asText(raw)?.trim().toLowerCase();
      if (!text || text.length > VALUE_LIMITS.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return fail(`${field.name}: not a valid email address`);
      return ok(text);
    }
    case "url": {
      const text = asText(raw)?.trim() ?? "";
      if (text.length > VALUE_LIMITS.url || !/^https?:\/\/[^\s/?#]+\.[^\s/?#]+(?:[/?#]\S*)?$/i.test(text)) return fail(`${field.name}: not a valid address (http:// or https://)`);
      return ok(text);
    }
    case "phone": {
      let text = (asText(raw) ?? "").replace(/[\s().\-/]/g, "");
      if (text.startsWith("00")) text = `+${text.slice(2)}`;
      if (!text.startsWith("+") && o.defaultPrefix) text = `${o.defaultPrefix.replace(/\s/g, "")}${text}`;
      if (!/^\+?\d{4,16}$/.test(text)) return fail(`${field.name}: not a valid phone number`);
      return ok(text);
    }
    case "number":
    case "rating": {
      const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.trim().replace(",", ".")) : Number.NaN;
      if (!Number.isFinite(n) || Math.abs(n) > VALUE_LIMITS.number) return fail(`${field.name}: expected a number`);
      if (field.type === "rating") {
        const max = o.max ?? 5;
        if (!Number.isInteger(n) || n < 0 || n > max) return fail(`${field.name}: expected a whole number from 0 to ${max}`);
        return ok(n);
      }
      const value = roundTo(n, o.precision ?? 0);
      if (o.min !== undefined && value < o.min) return fail(`${field.name}: at least ${o.min}`);
      if (o.max !== undefined && value > o.max) return fail(`${field.name}: at most ${o.max}`);
      return ok(value);
    }
    case "date": {
      const text = asText(raw)?.trim().slice(0, 10) ?? "";
      if (!isDay(text)) return fail(`${field.name}: not a valid date (YYYY-MM-DD)`);
      return ok(text);
    }
    case "datetime": {
      const text = asText(raw)?.trim() ?? "";
      const t = Date.parse(text);
      const year = Number.isNaN(t) ? 0 : new Date(t).getUTCFullYear();
      if (Number.isNaN(t) || year < VALUE_LIMITS.firstYear || year > VALUE_LIMITS.lastYear) return fail(`${field.name}: not a valid date and time`);
      return ok(new Date(t).toISOString());
    }
    case "select": {
      const text = asText(raw)?.trim().toLowerCase();
      const choice = (o.choices ?? []).find((c) => c.name.toLowerCase() === text);
      if (!choice) return fail(`${field.name}: "${String(raw)}" is not one of the choices`);
      return ok(choice.name);
    }
    case "multiselect": {
      const list = Array.isArray(raw) ? raw : [raw];
      const out: string[] = [];
      for (const item of list) {
        const text = asText(item)?.trim().toLowerCase();
        const choice = (o.choices ?? []).find((c) => c.name.toLowerCase() === text);
        if (!choice) return fail(`${field.name}: "${String(item)}" is not one of the choices`);
        if (!out.includes(choice.name)) out.push(choice.name);
      }
      return ok(out);
    }
    case "time": {
      const value = timeOfDay(asText(raw) ?? "");
      return value ? ok(value) : fail(`${field.name}: not a valid time (HH:MM)`);
    }
    case "duration": {
      const seconds = typeof raw === "number" ? raw : durationSeconds(asText(raw) ?? "");
      if (seconds === null || !Number.isFinite(seconds) || seconds < 0 || seconds > 1e9) return fail(`${field.name}: not a valid duration (h:mm or seconds)`);
      return ok(roundTo(seconds, 3));
    }
    case "geodata": {
      const value = geoPoint(raw);
      return value ? ok(value) : fail(`${field.name}: expected a latitude and a longitude (46.07;11.12)`);
    }
    case "color": {
      const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(asText(raw)?.trim() ?? "");
      if (!m) return fail(`${field.name}: expected a colour as #RRGGBB`);
      const hex = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join("") : m[1]!;
      return ok(`#${hex.toUpperCase()}`);
    }
    case "link":
    case "user": {
      const list = ids(raw, field.name);
      if (typeof list === "string") return fail(field.type === "user" ? `${field.name}: expected the ids of users` : list);
      if (!o.multiple && list.length > 1) return fail(`${field.name}: only one ${field.type === "user" ? "person" : "record"} can be chosen`);
      return ok(list);
    }
    case "attachment": {
      const list = ids(raw, field.name);
      if (typeof list === "string") return fail(`${field.name}: expected the ids of uploaded files`);
      const max = o.maxFiles ?? VALUE_LIMITS.files;
      if (list.length > max) return fail(`${field.name}: at most ${max} files`);
      return ok(list);
    }
    case "json": {
      try {
        const text = JSON.stringify(raw);
        if (text.length > VALUE_LIMITS.json) return fail(`${field.name}: too big`);
        return ok(JSON.parse(text));
      } catch {
        return fail(`${field.name}: not valid JSON`);
      }
    }
    default:
      return fail(`${field.name} cannot be written`);
  }
}

/**
 * Turns the text of a cell (a CSV import) into what normalizeValue accepts. Links come out as the names of
 * the records (the API finds them); attachments cannot come from a text.
 */
export function fromText(type: FieldType, text: string): unknown {
  const t = text.trim();
  if (t === "") return null;
  switch (type) {
    case "multiselect":
    case "link":
    case "user":
      return t.split(",").map((s) => s.trim()).filter((s) => s !== "");
    case "date": {
      const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
      return m ? `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}` : t;
    }
    case "number":
    case "rating":
      return /^-?\d+,\d+$/.test(t) ? t.replace(",", ".") : t;
    case "json":
      try {
        return JSON.parse(t);
      } catch {
        return t;
      }
    default:
      return t;
  }
}

/** A value as one line of text: for searching, sorting texts and the CSV export. */
export function textOf(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(textOf).filter((s) => s !== "").join(", ");
  if (typeof value === "object") {
    const named = value as { name?: unknown };
    return typeof named.name === "string" ? named.name : JSON.stringify(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

/** Who is writing a new record and when: what "today", "now" and "@me" mean in a default value. */
export interface DefaultContext {
  today: string;
  now: string;
  userId: number | null;
  email: string | null;
}

/** The default of a field for a new record, before it is normalized; undefined when there is none. */
export function defaultOf(field: Field, ctx: DefaultContext): unknown {
  const d = field.options.default;
  if (d === undefined || d === null || d === "") return undefined;
  if (d === "today") return field.type === "datetime" ? ctx.now : ctx.today;
  if (d === "now") return ctx.now;
  if (d === "@me") return field.type === "user" ? (ctx.userId === null ? undefined : [ctx.userId]) : (ctx.email ?? undefined);
  return d;
}

/** Field names may not hold braces (they would break the formulas) and must say something. */
export function fieldNameProblem(name: string): string | null {
  const t = name.trim();
  if (t === "") return "A field needs a name";
  if (t.length > 100) return "A field name can be at most 100 characters";
  if (/[{}]/.test(t)) return "A field name cannot contain { or }";
  if (/^#\d+$/.test(t)) return "A field name cannot look like an id (#12)";
  return null;
}
