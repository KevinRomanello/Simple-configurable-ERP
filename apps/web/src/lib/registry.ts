import type { ConditionOp, FieldType, Filter, ViewConfig } from "@erp/registry";
import type { FileRef, LinkedRef, RegField } from "../api/registry";

// What the pages of the registry need to show and edit values (docs/anagrafiche.md, §4 and §6). The values
// themselves come worked out from the server: here they are only written as text.

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Text",
  longtext: "Long text",
  email: "Email",
  url: "Address (URL)",
  phone: "Phone",
  number: "Number",
  rating: "Rating",
  checkbox: "Checkbox",
  date: "Date",
  datetime: "Date and time",
  time: "Time",
  duration: "Duration",
  geodata: "Coordinates",
  color: "Colour",
  user: "User of the ERP",
  uuid: "UUID",
  qrcode: "QR code",
  barcode: "Barcode",
  select: "Choice",
  multiselect: "Choices",
  link: "Link to another table",
  lookup: "Lookup",
  rollup: "Rollup",
  formula: "Formula",
  attachment: "Files",
  json: "JSON",
  button: "Button",
  autonumber: "Number of the record",
  created: "Created on",
  modified: "Changed on",
  creator: "Created by",
  modifier: "Changed by",
};

/** The types offered when adding a field, in the order of the list. */
export const NEW_FIELD_TYPES: FieldType[] = [
  "text", "longtext", "number", "select", "multiselect", "date", "datetime", "time", "duration", "checkbox", "email", "phone", "url", "rating",
  "link", "user", "lookup", "rollup", "formula", "attachment", "button", "geodata", "color", "json", "uuid", "qrcode", "barcode", "autonumber", "created", "modified", "creator", "modifier",
];

/** Types the grid changes in place; the others open the record. */
export const GRID_EDITABLE: FieldType[] = ["text", "email", "url", "phone", "number", "rating", "checkbox", "date", "select", "time", "geodata", "color"];

export const COMPUTED: FieldType[] = ["lookup", "rollup", "formula", "button", "uuid", "qrcode", "barcode", "autonumber", "created", "modified", "creator", "modifier"];

/** Seconds as a duration of its field: 5400 → "1:30" (h:mm), "1:30:00" (h:mm:ss)… */
export function formatDuration(seconds: number, format = "h:mm"): string {
  const decimals = format.includes(".") ? format.length - format.indexOf(".") - 1 : 0;
  const whole = format === "h:mm" ? Math.round(seconds / 60) * 60 : seconds;
  const minutes = `${Math.floor(whole / 3600)}:${String(Math.floor((whole % 3600) / 60)).padStart(2, "0")}`;
  if (format === "h:mm") return minutes;
  const s = whole % 60;
  return `${minutes}:${decimals > 0 ? s.toFixed(decimals).padStart(decimals + 3, "0") : String(Math.floor(s)).padStart(2, "0")}`;
}

const isRef = (v: unknown): v is LinkedRef | FileRef => typeof v === "object" && v !== null && "id" in v && "name" in v;

/** A value as one line of text, for a cell or a list. */
export function showValue(field: Pick<RegField, "type" | "options">, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (Array.isArray(value)) return value.map((v) => showValue(field.type === "lookup" ? { type: "text", options: {} } : field, v)).filter((s) => s !== "").join(", ");
  if (isRef(value)) return value.name;
  if (typeof value === "boolean") return value ? "✓" : "";
  if (field.type === "rating" && typeof value === "number") return "★".repeat(value) + "☆".repeat(Math.max(0, (field.options.max ?? 5) - value));
  if (field.type === "duration" && typeof value === "number") return formatDuration(value, field.options.durationFormat);
  if (field.type === "time" && typeof value === "string") return value.endsWith(":00") ? value.slice(0, 5) : value;
  if (field.type === "geodata" && typeof value === "string") return value.replace(";", ", ");
  if (field.type === "number" && typeof value === "number") {
    const digits = field.options.precision ?? 0;
    const text = value.toLocaleString("it-IT", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    if (field.options.format === "currency") return `${field.options.symbol ?? "€"} ${text}`;
    if (field.options.format === "percent") return `${text}%`;
    return text;
  }
  if ((field.type === "datetime" || field.type === "created" || field.type === "modified") && typeof value === "string") return value.slice(0, 16).replace("T", " ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export interface OpChoice {
  op: ConditionOp;
  label: string;
  /** Whether the condition needs a value. */
  value: boolean;
}

const EMPTY: OpChoice[] = [{ op: "empty", label: "is empty", value: false }, { op: "notEmpty", label: "is not empty", value: false }];
const TEXT: OpChoice[] = [
  { op: "eq", label: "is", value: true }, { op: "neq", label: "is not", value: true }, { op: "contains", label: "contains", value: true },
  { op: "notContains", label: "does not contain", value: true }, { op: "startsWith", label: "starts with", value: true }, ...EMPTY,
];
const ORDER: OpChoice[] = [
  { op: "eq", label: "=", value: true }, { op: "neq", label: "≠", value: true }, { op: "lt", label: "<", value: true }, { op: "lte", label: "≤", value: true },
  { op: "gt", label: ">", value: true }, { op: "gte", label: "≥", value: true }, ...EMPTY,
];
const LIST: OpChoice[] = [
  { op: "anyOf", label: "has any of", value: true }, { op: "allOf", label: "has all of", value: true }, { op: "noneOf", label: "has none of", value: true },
  { op: "notAllOf", label: "does not have all of", value: true }, ...EMPTY,
];
const WITHIN: OpChoice = { op: "within", label: "is within", value: true };

/** The periods of "is within" (NocoDB's isWithin): the ones with a number ask for it. */
export const WITHIN_PERIODS: { value: string; label: string; days?: boolean; range?: boolean }[] = [
  { value: "pastWeek", label: "the past week" }, { value: "pastMonth", label: "the past month" }, { value: "pastYear", label: "the past year" },
  { value: "nextWeek", label: "the next week" }, { value: "nextMonth", label: "the next month" }, { value: "nextYear", label: "the next year" },
  { value: "pastNumberOfDays", label: "the past … days", days: true }, { value: "nextNumberOfDays", label: "the next … days", days: true },
  { value: "thisCalendarWeek", label: "this week" }, { value: "thisCalendarMonth", label: "this month" }, { value: "thisCalendarYear", label: "this year" },
  { value: "lastCalendarWeek", label: "last week" }, { value: "lastCalendarMonth", label: "last month" }, { value: "lastCalendarYear", label: "last year" },
  { value: "nextCalendarWeek", label: "next week" }, { value: "nextCalendarMonth", label: "next month" }, { value: "nextCalendarYear", label: "next year" },
  { value: "dateRange", label: "from … to …", range: true },
];

/** The conditions a filter offers for a field. */
export function opsFor(type: FieldType): OpChoice[] {
  switch (type) {
    case "number": case "rating": case "rollup": case "autonumber": case "time": case "duration":
      return ORDER;
    case "date": case "datetime": case "created": case "modified":
      return [...ORDER, WITHIN];
    case "checkbox":
      return [{ op: "checked", label: "is checked", value: false }, { op: "notChecked", label: "is not checked", value: false }];
    case "select":
      return [{ op: "eq", label: "is", value: true }, { op: "neq", label: "is not", value: true }, { op: "anyOf", label: "is any of", value: true }, { op: "noneOf", label: "is none of", value: true }, ...EMPTY];
    case "multiselect": case "link": case "user":
      return LIST;
    case "attachment":
      return EMPTY;
    default:
      return TEXT;
  }
}

/** The address of a list of records: the view, and what the person added on top (a filter, a sort, words, a group). */
export function recordsQuery(view: number | undefined, extra: { filter?: Filter; sort?: string; q?: string; groupBy?: number[]; aggregate?: string; limit?: number; offset?: number }) {
  const query = new URLSearchParams();
  if (view !== undefined) query.set("view", String(view));
  if (extra.filter && extra.filter.items.length > 0) query.set("filter", JSON.stringify(extra.filter));
  if (extra.sort) query.set("sort", extra.sort);
  if (extra.q?.trim()) query.set("q", extra.q.trim());
  if (extra.groupBy !== undefined) query.set("groupBy", extra.groupBy.join(","));
  if (extra.aggregate) query.set("aggregate", extra.aggregate);
  query.set("limit", String(extra.limit ?? 1000));
  if (extra.offset) query.set("offset", String(extra.offset));
  return query;
}

/** The fields a view shows, in its order. */
export function viewFields(fields: RegField[], config: ViewConfig): RegField[] {
  const hidden = new Set(config.hidden ?? []);
  const order = config.order ?? [];
  const at = (f: RegField) => (order.includes(f.id) ? order.indexOf(f.id) : order.length + f.position);
  return fields.filter((f) => !hidden.has(f.id)).sort((a, b) => at(a) - at(b));
}

/** A file read as base64 (what a form sends). */
export function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(reader.error ?? new Error("The file cannot be read"));
    reader.readAsDataURL(file);
  });
}

/** The summaries a list can give of a field (the API's `aggregate`). */
export const SUMMARIES: { fn: string; label: string; numeric: boolean }[] = [
  { fn: "count", label: "Filled", numeric: false },
  { fn: "empty", label: "Empty", numeric: false },
  { fn: "unique", label: "Different values", numeric: false },
  { fn: "percentFilled", label: "% filled", numeric: false },
  { fn: "percentEmpty", label: "% empty", numeric: false },
  { fn: "percentUnique", label: "% different", numeric: false },
  { fn: "checked", label: "Checked", numeric: false },
  { fn: "unchecked", label: "Not checked", numeric: false },
  { fn: "percentChecked", label: "% checked", numeric: false },
  { fn: "sum", label: "Sum", numeric: true },
  { fn: "avg", label: "Average", numeric: true },
  { fn: "median", label: "Median", numeric: true },
  { fn: "stddev", label: "Standard deviation", numeric: true },
  { fn: "min", label: "Smallest", numeric: true },
  { fn: "max", label: "Largest", numeric: true },
  { fn: "range", label: "Range", numeric: true },
];

/** The levels a view groups by (one field, or a list). */
export const groupLevels = (groupBy: ViewConfig["groupBy"]): number[] => (groupBy === undefined ? [] : Array.isArray(groupBy) ? groupBy : [groupBy]);

const DAY_MS = 86_400_000;
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

/** A bar of the timeline: its days, and the records that come after it (the gantt). */
export interface Bar {
  id: number;
  start: string;
  end: string;
  next: number[];
}

/**
 * The days that change when a bar of the timeline moves to `start`–`end`: the bar itself and, in a gantt, every
 * record after it that would start before its predecessor ends, pushed to the day after, keeping its length.
 */
export function planMove(bars: Bar[], id: number, start: string, end: string): { id: number; start: string; end: string }[] {
  const byId = new Map(bars.map((b) => [b.id, { ...b }]));
  const moved = byId.get(id);
  if (!moved) return [];
  moved.start = start;
  moved.end = end < start ? start : end;
  const changed = new Map([[id, moved]]);
  // breadth first: a record that moves pushes the ones after it in turn (a loop without the moved bar stops at the guard)
  const queue = [id];
  for (let guard = 0; queue.length > 0 && guard < 10_000; guard++) {
    const before = byId.get(queue.shift()!)!;
    for (const nextId of before.next) {
      const after = byId.get(nextId);
      // the bar the person placed stays where it was put, even in a loop of links
      if (!after || after.id === id || after.start > before.end) continue;
      const shift = daysBetween(after.start, addDays(before.end, 1));
      after.start = addDays(after.start, shift);
      after.end = addDays(after.end, shift);
      queue.push(after.id);
      changed.set(after.id, after);
    }
  }
  return [...changed.values()].map((b) => ({ id: b.id, start: b.start, end: b.end }));
}