import type { Registry } from "./compute";
import { addTime, dayText, startOf, timeOf } from "./datetime";
import { isFilter, type Condition, type ConditionOp, type Field, type Filter, type RecordRow } from "./types";
import { isEmptyValue, textOf } from "./values";

// Whether a record matches a filter (docs/anagrafiche.md, §6). The same rules for views, groups, forms,
// webhooks and the API.

/**
 * Who is looking: `@me` in a filter is their email in a text, their record in a link to the people, their
 * account in a user field.
 */
export interface FilterEnv {
  today: string;
  me?: { email: string | null; personId: number | null; userId?: number | null };
  peopleTableId?: number | null;
}

const DAY = /^today(?:\s*([+-])\s*(\d{1,5})\s*([dwmy]?))?$/i;
const UNITS = { d: "day", w: "week", m: "month", y: "year" } as const;

/** `today`, `today-7`, `today+30`, `today-1m` (a month ago), `today+1y` as a day; anything else as it is. */
export function resolveDay(value: unknown, today: string): unknown {
  if (typeof value !== "string") return value;
  const m = DAY.exec(value.trim());
  if (!m) return value;
  const t = timeOf(today);
  if (!m[1]) return today;
  const unit = UNITS[(m[3] || "d").toLowerCase() as keyof typeof UNITS];
  return dayText(addTime(t, (m[1] === "-" ? -1 : 1) * Number(m[2]), unit));
}

/** The first and last day (both in) of a period of `within`, from today; null for a period that is not known. */
export function periodOf(value: unknown, today: string): [string, string] | null {
  const [name, a, b] = Array.isArray(value) ? value : [value];
  const t = timeOf(today);
  const day = (x: number) => dayText(x);
  const days = (n: number) => addTime(t, n, "day");
  const calendar = (unit: "week" | "month" | "year", shift: number): [string, string] => {
    const start = startOf(addTime(t, shift, unit), unit);
    return [day(start), day(addTime(addTime(start, 1, unit), -1, "day"))];
  };
  const n = Number(a);
  switch (name) {
    case "pastWeek": return [day(days(-7)), today];
    case "pastMonth": return [day(addTime(t, -1, "month")), today];
    case "pastYear": return [day(addTime(t, -1, "year")), today];
    case "nextWeek": return [today, day(days(7))];
    case "nextMonth": return [today, day(addTime(t, 1, "month"))];
    case "nextYear": return [today, day(addTime(t, 1, "year"))];
    case "pastNumberOfDays": return Number.isInteger(n) && n >= 0 ? [day(days(-n)), today] : null;
    case "nextNumberOfDays": return Number.isInteger(n) && n >= 0 ? [today, day(days(n))] : null;
    case "thisCalendarWeek": return calendar("week", 0);
    case "thisCalendarMonth": return calendar("month", 0);
    case "thisCalendarYear": return calendar("year", 0);
    case "lastCalendarWeek": return calendar("week", -1);
    case "lastCalendarMonth": return calendar("month", -1);
    case "lastCalendarYear": return calendar("year", -1);
    case "nextCalendarWeek": return calendar("week", 1);
    case "nextCalendarMonth": return calendar("month", 1);
    case "nextCalendarYear": return calendar("year", 1);
    case "dateRange": {
      const from = String(resolveDay(a, today));
      const to = String(resolveDay(b, today));
      return /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) ? [from, to] : null;
    }
    default: return null;
  }
}

const lower = (v: unknown) => textOf(v).trim().toLowerCase();

/** The items a value is made of: a list for multiple choices, links and lookups; one item otherwise. */
const itemsOf = (v: unknown): unknown[] => (Array.isArray(v) ? v.flatMap(itemsOf) : isEmptyValue(v) ? [] : [v]);

function listOf(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return value.split(",").map((s) => s.trim()).filter((s) => s !== "");
  return value === undefined || value === null ? [] : [value];
}

const isDayText = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);

/** Compares a value of the record with the one of the condition: numbers as numbers, days as days, the rest as text. */
function order(a: unknown, b: unknown): number | null {
  if (isEmptyValue(a) || isEmptyValue(b)) return null;
  if (isDayText(a) && isDayText(b)) {
    // a moment against a day compares the day
    const x = String(a).length > 10 && String(b).length === 10 ? String(a).slice(0, 10) : String(a);
    const y = String(b);
    return x < y ? -1 : x > y ? 1 : 0;
  }
  const x = typeof a === "number" ? a : Number(a);
  const y = typeof b === "number" ? b : Number(String(b).replace(",", "."));
  if (Number.isFinite(x) && Number.isFinite(y) && typeof a !== "boolean") return x < y ? -1 : x > y ? 1 : 0;
  const s = lower(a);
  const t = lower(b);
  return s < t ? -1 : s > t ? 1 : 0;
}

function same(item: unknown, wanted: unknown): boolean {
  if (typeof item === "boolean") return item === (wanted === true || lower(wanted) === "true");
  return order(item, wanted) === 0;
}

/** For links: an item is the id of a record or its name. */
function sameLinked(id: number, name: string, wanted: unknown): boolean {
  if (typeof wanted === "number" || (typeof wanted === "string" && /^\d+$/.test(wanted.trim()))) return id === Number(wanted);
  return name.toLowerCase() === lower(wanted);
}

function conditionMatches(reg: Registry, record: RecordRow, field: Field, condition: Condition, env: FilterEnv): boolean {
  const op: ConditionOp = condition.op;
  const isLink = field.type === "link" || field.type === "user";
  const linksPeople = field.type === "link" && field.options.tableId === env.peopleTableId;
  // the value of the condition, with @me and today worked out
  const swap = (v: unknown): unknown => {
    if (v === "@me") {
      if (field.type === "user") return env.me?.userId ?? Number.NaN;
      return linksPeople ? (env.me?.personId ?? Number.NaN) : (env.me?.email ?? "\u0000nobody");
    }
    return resolveDay(v, env.today);
  };
  const wanted = Array.isArray(condition.value) ? condition.value.map(swap) : swap(condition.value);

  const raw = reg.value(record, field);
  if (op === "empty") return isEmptyValue(raw) || raw === false;
  if (op === "notEmpty") return !(isEmptyValue(raw) || raw === false);
  if (op === "checked") return raw === true || (typeof raw !== "boolean" && !isEmptyValue(raw) && raw !== 0);
  if (op === "notChecked") return !(raw === true || (typeof raw !== "boolean" && !isEmptyValue(raw) && raw !== 0));

  if (op === "within") {
    const period = periodOf(condition.value, env.today);
    if (!period) return false;
    return itemsOf(raw).some((i) => {
      const day = textOf(i).slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= period[0] && day <= period[1];
    });
  }

  if (isLink) {
    const refs = field.type === "user"
      ? (reg.output(record, field) as { id: number; name: string }[])
      : reg.linkedIds(record, field).map((id) => ({ id, name: reg.display(id) }));
    const list = listOf(wanted);
    const hit = (w: unknown) => refs.some((r) => sameLinked(r.id, r.name, w));
    switch (op) {
      case "eq":
      case "anyOf":
        return list.some(hit);
      case "allOf":
        return list.every(hit);
      case "notAllOf":
        return !list.every(hit);
      case "neq":
      case "noneOf":
        return !list.some(hit);
      case "contains":
        return refs.some((r) => r.name.toLowerCase().includes(lower(wanted)));
      case "notContains":
        return !refs.some((r) => r.name.toLowerCase().includes(lower(wanted)));
      default:
        return false;
    }
  }

  const items = itemsOf(raw);
  const text = (fn: (s: string) => boolean) => items.some((i) => fn(lower(i)));
  switch (op) {
    case "eq":
      return items.some((i) => same(i, wanted)) || (items.length === 0 && raw === false && same(false, wanted));
    case "neq":
      return !items.some((i) => same(i, wanted));
    case "contains":
      return text((s) => s.includes(lower(wanted)));
    case "notContains":
      return !text((s) => s.includes(lower(wanted)));
    case "startsWith":
      return text((s) => s.startsWith(lower(wanted)));
    case "endsWith":
      return text((s) => s.endsWith(lower(wanted)));
    case "lt":
    case "lte":
    case "gt":
    case "gte":
      return items.some((i) => {
        const c = order(i, wanted);
        if (c === null) return false;
        return op === "lt" ? c < 0 : op === "lte" ? c <= 0 : op === "gt" ? c > 0 : c >= 0;
      });
    case "anyOf":
      return listOf(wanted).some((w) => items.some((i) => same(i, w)));
    case "allOf":
      return listOf(wanted).every((w) => items.some((i) => same(i, w)));
    case "noneOf":
      return !listOf(wanted).some((w) => items.some((i) => same(i, w)));
    case "notAllOf":
      return !listOf(wanted).every((w) => items.some((i) => same(i, w)));
    default:
      return false;
  }
}

/**
 * Whether `record` matches `filter`. A condition on a field that no longer exists is left out; an empty
 * group matches everything.
 */
export function matches(reg: Registry, record: RecordRow, filter: Filter | undefined, env: FilterEnv): boolean {
  if (!filter || filter.items.length === 0) return true;
  const results = filter.items.map((item) => {
    if (isFilter(item)) return matches(reg, record, item, env);
    const field = reg.field(item.field);
    if (!field || field.tableId !== record.tableId) return true;
    return conditionMatches(reg, record, field, item, env);
  });
  const result = filter.join === "or" ? results.some(Boolean) : results.every(Boolean);
  return filter.not ? !result : result;
}

/** The field ids a filter talks about (to clean filters when a field goes, and to check them). */
export function filterFields(filter: Filter | undefined): number[] {
  if (!filter) return [];
  return filter.items.flatMap((item) => (isFilter(item) ? filterFields(item) : [item.field]));
}

/** The filter without the conditions on the fields given (a field was deleted). */
export function dropFields(filter: Filter | undefined, gone: number[]): Filter | undefined {
  if (!filter) return undefined;
  const items = filter.items
    .map((item) => (isFilter(item) ? dropFields(item, gone) : gone.includes(item.field) ? undefined : item))
    .filter((item): item is Condition | Filter => item !== undefined);
  return { join: filter.join, items, ...(filter.not ? { not: true } : {}) };
}
