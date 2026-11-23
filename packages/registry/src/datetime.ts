// Days and moments for the formulas and the filters: written and read in the formats of NocoDB (Day.js
// tokens), weeks, working days, periods. Everything in UTC on ISO texts, never the local clock.

export const DAY_MS = 86_400_000;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const isoDay = /^\d{4}-\d{2}-\d{2}$/;

/** A day or a moment as milliseconds; NaN when the text is neither. `2022/10/14` is read as a day too. */
export function timeOf(text: string): number {
  const t = text.trim().replace(/^(\d{4})\/(\d{2})\/(\d{2})/, "$1-$2-$3");
  if (isoDay.test(t)) return Date.parse(`${t}T00:00:00Z`);
  // "2022-03-14 10:00" is a moment in UTC
  const spaced = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(t) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(t) ? `${t.replace(" ", "T")}Z` : t;
  return Date.parse(spaced);
}

export const dayText = (t: number) => new Date(t).toISOString().slice(0, 10);

/** The index of a day name ("monday" → 1), Sunday 0; undefined for anything else. */
export function weekdayIndex(name: string): number | undefined {
  const i = WEEKDAYS.findIndex((d) => d.toLowerCase() === name.trim().toLowerCase());
  return i < 0 ? undefined : i;
}

/** NocoDB's WEEKDAY: 0 for the first day of the week (Monday unless told), up to 6. */
export function weekday(t: number, start = 1): number {
  return (new Date(t).getUTCDay() - start + 7) % 7;
}

/** NocoDB's WEEKNUM: week 1 holds 1 January, weeks start on Sunday unless told. */
export function weekNumber(t: number, start = 0): number {
  const d = new Date(t);
  const first = Date.UTC(d.getUTCFullYear(), 0, 1);
  const dayOfYear = Math.floor((t - first) / DAY_MS);
  return Math.floor((dayOfYear + weekday(first, start)) / 7) + 1;
}

const pad = (n: number, size = 2) => String(n).padStart(size, "0");
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;

const PRESETS: Record<string, string> = {
  LT: "h:mm A", LTS: "h:mm:ss A", L: "MM/DD/YYYY", LL: "MMMM D, YYYY", LLL: "MMMM D, YYYY h:mm A", LLLL: "dddd, MMMM D, YYYY h:mm A",
  l: "M/D/YYYY", ll: "MMM D, YYYY", lll: "MMM D, YYYY h:mm A", llll: "ddd, MMM D, YYYY h:mm A",
};

const TOKENS = /\[([^\]]*)]|YYYY|YY|MMMM|MMM|MM|M|Do|DD|D|dddd|ddd|dd|d|HH|H|hh|h|mm|m|ss|s|SSS|A|a|LLLL|LLL|LTS|LT|LL|L|llll|lll|ll|l/g;

/** A moment written with Day.js tokens (English names), as DATETIME_FORMAT does. */
export function formatTime(t: number, format = "YYYY-MM-DD HH:mm"): string {
  const d = new Date(t);
  const hours = d.getUTCHours();
  const parts: Record<string, string> = {
    YYYY: String(d.getUTCFullYear()), YY: pad(d.getUTCFullYear() % 100),
    MMMM: MONTHS[d.getUTCMonth()]!, MMM: MONTHS[d.getUTCMonth()]!.slice(0, 3), MM: pad(d.getUTCMonth() + 1), M: String(d.getUTCMonth() + 1),
    Do: ordinal(d.getUTCDate()), DD: pad(d.getUTCDate()), D: String(d.getUTCDate()),
    dddd: WEEKDAYS[d.getUTCDay()]!, ddd: WEEKDAYS[d.getUTCDay()]!.slice(0, 3), dd: WEEKDAYS[d.getUTCDay()]!.slice(0, 2), d: String(d.getUTCDay()),
    HH: pad(hours), H: String(hours), hh: pad(hours % 12 || 12), h: String(hours % 12 || 12),
    mm: pad(d.getUTCMinutes()), m: String(d.getUTCMinutes()), ss: pad(d.getUTCSeconds()), s: String(d.getUTCSeconds()),
    SSS: pad(d.getUTCMilliseconds(), 3), A: hours < 12 ? "AM" : "PM", a: hours < 12 ? "am" : "pm",
  };
  return format.replace(TOKENS, (token, literal: string | undefined) => {
    if (literal !== undefined) return literal;
    if (PRESETS[token]) return formatTime(t, PRESETS[token]);
    return parts[token] ?? token;
  });
}

const PARSE_TOKENS = /YYYY|YY|MM|M|DD|D|HH|H|hh|h|mm|m|ss|s|SSS|A|a/g;

/**
 * Reads a text written with Day.js tokens (DATETIME_PARSE). Gives the moment, and whether the format had a
 * time; null when the text does not follow the format. Without a format the text must be ISO.
 */
export function parseTime(text: string, format?: string): { t: number; hasTime: boolean } | null {
  if (!format) {
    const t = timeOf(text);
    return Number.isNaN(t) ? null : { t, hasTime: !isoDay.test(text.trim()) };
  }
  const order: string[] = [];
  const pattern = format.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(PARSE_TOKENS, (token) => {
    order.push(token);
    return token === "A" || token === "a" ? "([AaPp][Mm])" : token === "SSS" ? "(\\d{3})" : token === "YYYY" ? "(\\d{4})" : "(\\d{1,2})";
  });
  const m = new RegExp(`^${pattern}$`).exec(text.trim());
  if (!m) return null;
  const got: Record<string, string> = {};
  order.forEach((token, i) => (got[token] = m[i + 1]!));
  const year = got.YYYY ? Number(got.YYYY) : got.YY ? 2000 + Number(got.YY) : 1970;
  let hours = Number(got.HH ?? got.H ?? got.hh ?? got.h ?? 0);
  const meridiem = (got.A ?? got.a ?? "").toLowerCase();
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  const month = Number(got.MM ?? got.M ?? 1) - 1;
  const day = Number(got.DD ?? got.D ?? 1);
  const t = Date.UTC(year, month, day, hours, Number(got.mm ?? got.m ?? 0), Number(got.ss ?? got.s ?? 0), Number(got.SSS ?? 0));
  const back = new Date(t);
  if (back.getUTCMonth() !== month || back.getUTCDate() !== day) return null;
  return { t, hasTime: order.some((token) => /^[Hhms]/.test(token)) };
}

/** The unit of DATETIME_DIFF, DATEADD, IS_SAME… from its long or short name ("m" is minutes, "M" months). */
export function unitOf(name: string): "ms" | "second" | "minute" | "hour" | "day" | "week" | "month" | "quarter" | "year" | undefined {
  const short: Record<string, ReturnType<typeof unitOf>> = { ms: "ms", s: "second", m: "minute", h: "hour", d: "day", w: "week", M: "month", Q: "quarter", y: "year" };
  if (short[name.trim()]) return short[name.trim()];
  const long = name.trim().toLowerCase().replace(/s$/, "");
  if (long === "millisecond") return "ms";
  return (["second", "minute", "hour", "day", "week", "month", "quarter", "year"] as const).find((u) => u === long);
}

/** The moment moved by `amount` units; a month later keeps the day, or the last one of a shorter month. */
export function addTime(t: number, amount: number, unit: NonNullable<ReturnType<typeof unitOf>>): number {
  const d = new Date(t);
  const addMonths = (months: number) => {
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + months);
    d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()));
  };
  const fixed = { ms: 1, second: 1_000, minute: 60_000, hour: 3_600_000, day: DAY_MS, week: 7 * DAY_MS } as const;
  if (unit in fixed) return t + amount * fixed[unit as keyof typeof fixed];
  addMonths(unit === "month" ? amount : unit === "quarter" ? 3 * amount : 12 * amount);
  return d.getTime();
}

/** `a - b` in whole units (towards zero), as DATETIME_DIFF does. */
export function timeDiff(a: number, b: number, unit: NonNullable<ReturnType<typeof unitOf>>): number {
  const fixed = { ms: 1, second: 1_000, minute: 60_000, hour: 3_600_000, day: DAY_MS, week: 7 * DAY_MS } as const;
  if (unit in fixed) return Math.trunc((a - b) / fixed[unit as keyof typeof fixed]);
  const da = new Date(a);
  const db = new Date(b);
  let months = (da.getUTCFullYear() - db.getUTCFullYear()) * 12 + da.getUTCMonth() - db.getUTCMonth();
  // a month is not over until its day (and time) comes back
  const rest = (d: Date) => d.getTime() - Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  if (months > 0 && rest(da) < rest(db)) months--;
  if (months < 0 && rest(da) > rest(db)) months++;
  return unit === "month" ? months : unit === "quarter" ? Math.trunc(months / 3) : Math.trunc(months / 12);
}

/** The start of the unit a moment is in (the day, the Monday of its week, the first of its month…). */
export function startOf(t: number, unit: NonNullable<ReturnType<typeof unitOf>>, weekStart = 1): number {
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth();
  switch (unit) {
    case "ms": return t;
    case "second": return t - (t % 1_000);
    case "minute": return t - (t % 60_000);
    case "hour": return t - (t % 3_600_000);
    case "day": return Date.UTC(y, mo, d.getUTCDate());
    case "week": return Date.UTC(y, mo, d.getUTCDate()) - weekday(t, weekStart) * DAY_MS;
    case "month": return Date.UTC(y, mo, 1);
    case "quarter": return Date.UTC(y, mo - (mo % 3), 1);
    case "year": return Date.UTC(y, 0, 1);
  }
}

const isWorkday = (t: number, holidays: Set<string>) => {
  const day = new Date(t).getUTCDay();
  return day !== 0 && day !== 6 && !holidays.has(dayText(t));
};

/** The day `count` working days after `start` (Saturdays, Sundays and the holidays skipped), as WORKDAY does. */
export function workday(start: number, count: number, holidays: Set<string>): number {
  let t = startOf(start, "day");
  const step = count < 0 ? -DAY_MS : DAY_MS;
  for (let left = Math.abs(Math.trunc(count)); left > 0; ) {
    t += step;
    if (isWorkday(t, holidays)) left--;
  }
  return t;
}

/** The working days from `start` to `end`, both counted (negative when `end` comes first), as WORKDAY_DIFF does. */
export function workdayDiff(start: number, end: number, holidays: Set<string>): number {
  const [from, to, sign] = start <= end ? [start, end, 1] : [end, start, -1];
  let count = 0;
  // a span of more than a few centuries is not a formula anybody needs
  for (let t = startOf(from, "day"), n = 0; t <= to && n < 200_000; t += DAY_MS, n++) if (isWorkday(t, holidays)) count++;
  return sign * count;
}

/** The days (YYYY-MM-DD) in a list of holidays given as "2026-12-25, 2027-01-01" or as a list of dates. */
export function holidaysOf(values: unknown[]): Set<string> {
  const days = values.flatMap((v) => String(v ?? "").split(",")).map((s) => s.trim()).filter((s) => isoDay.test(s.slice(0, 10)));
  return new Set(days.map((s) => s.slice(0, 10)));
}
