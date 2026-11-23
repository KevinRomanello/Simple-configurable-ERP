import type { Registry } from "./compute";
import { matches, type FilterEnv } from "./filter";
import type { Field, Filter, RecordRow, Sort, ViewConfig } from "./types";
import { isEmptyValue, textOf } from "./values";

// Listing records: filter, free search, sort, group, page (docs/anagrafiche.md, §6 and §10.2).

/** The summaries a list can give of a field, over every record that matches (like the footer of NocoDB's grid). */
export const AGGREGATE_FNS = [
  "count", "empty", "unique", "percentFilled", "percentEmpty", "percentUnique", "sum", "avg", "median", "stddev", "min", "max", "range",
  "checked", "unchecked", "percentChecked",
] as const;
export type AggregateFn = (typeof AGGREGATE_FNS)[number];

export interface QueryInput {
  filter?: Filter;
  aggregates?: { field: number; fn: AggregateFn }[];
  /** Words looked for in the fields of `searchFields` (all words must be found). */
  search?: string;
  searchFields?: Field[];
  sorts?: Sort[];
  /** The fields to group by, the outer one first (up to five). */
  groupBy?: number[];
  offset?: number;
  limit?: number;
}

export interface QueryGroup {
  /** The value the records share, as text ("" for the empty ones): of the first field grouped by. */
  key: string;
  /** The values of every level, the outer one first (key is keys[0]). */
  keys: string[];
  count: number;
  /** The summaries asked for, over the records of this group only (NocoDB's group aggregations). */
  aggregates?: { field: number; fn: AggregateFn; value: number | string | null }[];
}

/** The levels of a view's grouping: none, one field, or a list. */
export const groupLevels = (groupBy: ViewConfig["groupBy"]): number[] => (groupBy === undefined ? [] : Array.isArray(groupBy) ? groupBy : [groupBy]);

export interface QueryResult {
  /** The records of the page, in order. */
  records: RecordRow[];
  /** How many match, before paging. */
  total: number;
  groups?: QueryGroup[];
  aggregates?: { field: number; fn: AggregateFn; value: number | string | null }[];
}

/** A summary of one field over the records: how many have a value, how many are empty, distinct values, sums… */
export function aggregate(reg: Registry, records: RecordRow[], field: Field, fn: AggregateFn): number | string | null {
  const values = records.map((r) => reg.value(r, field));
  const filled = values.filter((v) => !isEmptyValue(v) && v !== false);
  const numbers = values.flatMap((v) => (Array.isArray(v) ? v : [v])).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const round = (n: number) => Math.round(n * 1e10) / 1e10;
  const percent = (part: number) => (values.length ? round((100 * part) / values.length) : null);
  const unique = new Set(filled.map((v) => textOf(v).toLowerCase())).size;
  const avg = numbers.length ? numbers.reduce((s, n) => s + n, 0) / numbers.length : null;
  const sorted = [...numbers].sort((a, b) => a - b);
  switch (fn) {
    case "count": return filled.length;
    case "empty": return values.length - filled.length;
    case "percentFilled": return percent(filled.length);
    case "percentEmpty": return percent(values.length - filled.length);
    case "checked": return values.filter((v) => v === true).length;
    case "unchecked": return values.filter((v) => v !== true).length;
    case "percentChecked": return percent(values.filter((v) => v === true).length);
    case "unique": return unique;
    case "percentUnique": return percent(unique);
    case "sum": return round(numbers.reduce((s, n) => s + n, 0));
    case "avg": return avg === null ? null : round(avg);
    case "median": {
      if (!sorted.length) return null;
      const mid = Math.floor(sorted.length / 2);
      return round(sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2);
    }
    // the standard deviation of the population, as NocoDB's footer
    case "stddev": return avg === null ? null : round(Math.sqrt(numbers.reduce((s, n) => s + (n - avg) ** 2, 0) / numbers.length));
    case "range": return sorted.length ? round(sorted[sorted.length - 1]! - sorted[0]!) : null;
    case "min": {
      if (numbers.length) return Math.min(...numbers);
      const texts = filled.map(textOf).sort();
      return texts[0] ?? null;
    }
    case "max": {
      if (numbers.length) return Math.max(...numbers);
      const texts = filled.map(textOf).sort();
      return texts[texts.length - 1] ?? null;
    }
  }
}

const collator = new Intl.Collator("it", { sensitivity: "base", numeric: true });

/** The value a sort or a group uses: the first item of a list, numbers as numbers, the rest as text. */
function sortKey(reg: Registry, record: RecordRow, field: Field): number | string | null {
  const raw = reg.value(record, field);
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (isEmptyValue(first)) return field.type === "checkbox" ? 0 : null;
  if (typeof first === "number") return first;
  if (typeof first === "boolean") return first ? 1 : 0;
  if (field.type === "select") {
    // choices keep the order they were given in
    const at = (field.options.choices ?? []).findIndex((c) => c.name === first);
    if (at >= 0) return at;
  }
  return textOf(first);
}

function compareKeys(a: number | string | null, b: number | string | null): number {
  if (a === null && b === null) return 0;
  // the empty ones go last, whatever the direction
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return collator.compare(String(a), String(b));
}

export function runQuery(reg: Registry, rows: RecordRow[], input: QueryInput, env: FilterEnv): QueryResult {
  let found = rows.filter((r) => matches(reg, r, input.filter, env));

  const words = (input.search ?? "").toLowerCase().split(/\s+/).filter((w) => w !== "");
  if (words.length > 0) {
    const fields = input.searchFields ?? [];
    found = found.filter((r) => {
      const text = fields.map((f) => textOf(reg.output(r, f))).join(" \u0001 ").toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }

  const sorts = (input.sorts ?? []).map((s) => ({ field: reg.field(s.field), dir: s.dir })).filter((s): s is { field: Field; dir: "asc" | "desc" } => s.field !== undefined);
  const levels = (input.groupBy ?? []).slice(0, 5).map((id) => reg.field(id)).filter((f): f is Field => f !== undefined);
  const keyed = found.map((record) => ({
    record,
    groups: levels.map((f) => sortKey(reg, record, f)),
    keys: sorts.map((s) => sortKey(reg, record, s.field)),
  }));
  keyed.sort((a, b) => {
    for (let i = 0; i < levels.length; i++) {
      const g = compareKeys(a.groups[i] ?? null, b.groups[i] ?? null);
      if (g !== 0) return g;
    }
    for (let i = 0; i < sorts.length; i++) {
      const x = a.keys[i] ?? null;
      const y = b.keys[i] ?? null;
      const c = compareKeys(x, y);
      if (c !== 0) return x === null || y === null ? c : sorts[i]!.dir === "desc" ? -c : c;
    }
    return a.record.id - b.record.id;
  });

  let groups: QueryGroup[] | undefined;
  if (levels.length > 0) {
    groups = [];
    for (const item of keyed) {
      const keys = levels.map((f) => {
        const raw = reg.value(item.record, f);
        return f.type === "checkbox" ? (raw === true ? "true" : "false") : textOf(Array.isArray(raw) ? raw[0] : raw);
      });
      const last = groups[groups.length - 1];
      if (last && last.keys.every((k, i) => k === keys[i])) last.count++;
      else groups.push({ key: keys[0]!, keys, count: 1 });
    }
  }

  const all = keyed.map((k) => k.record);
  const asked = (input.aggregates ?? [])
    .map((a) => ({ a, field: reg.field(a.field) }))
    .filter((x): x is { a: { field: number; fn: AggregateFn }; field: Field } => x.field !== undefined);
  const summarise = (records: RecordRow[]) => asked.map(({ a, field }) => ({ field: a.field, fn: a.fn, value: aggregate(reg, records, field, a.fn) }));
  const aggregates = input.aggregates ? summarise(all) : undefined;
  if (groups && asked.length > 0) {
    let at = 0;
    for (const g of groups) {
      g.aggregates = summarise(all.slice(at, at + g.count));
      at += g.count;
    }
  }
  const offset = Math.max(0, input.offset ?? 0);
  const limit = input.limit ?? keyed.length;
  return { records: all.slice(offset, offset + limit), total: keyed.length, groups, aggregates };
}

/** The colour of a record in a view: the one of its choice in `colorBy`, or of the first rule it matches. */
export function recordColor(reg: Registry, record: RecordRow, config: ViewConfig, env: FilterEnv): string | null {
  const by = config.colorBy !== undefined ? reg.field(config.colorBy) : undefined;
  if (by && (by.type === "select" || by.type === "multiselect")) {
    const raw = reg.value(record, by);
    const first = Array.isArray(raw) ? raw[0] : raw;
    const color = by.options.choices?.find((c) => c.name === first)?.color;
    if (color) return color;
  }
  return config.colors?.find((rule) => matches(reg, record, rule.filter, env))?.color ?? null;
}
