import { WITHIN_PERIODS, type Condition, type ConditionOp, type FieldType, type Filter } from "./types";

// The `where` of NocoDB's API, which the team's automations already use, read into a Filter:
//   (State,anyof,In trial,Active Member)~and(Area,eq,SW)~or((Matricola,blank)~and(Age,gt,18))
//   ~not(Done,checked)   ("Name", eq, "Rossi, Mario")   (Due,lt,daysAgo,10)   (Due,isWithin,nextNumberOfDays,7)
// AND binds before OR, as usual. Values may be quoted (v3), a leading "@" (v2 with the v3 syntax) is allowed,
// and the operator names of NocoDB and of this registry both work.

export class WhereError extends Error {}

const OPS: Record<string, ConditionOp> = {
  eq: "eq", neq: "neq", not: "neq", ne: "neq",
  like: "contains", nlike: "notContains", contains: "contains", notcontains: "notContains", startswith: "startsWith", endswith: "endsWith",
  gt: "gt", ge: "gte", gte: "gte", lt: "lt", le: "lte", lte: "lte",
  blank: "empty", isblank: "empty", empty: "empty", null: "empty", notblank: "notEmpty", isnotblank: "notEmpty", notempty: "notEmpty", notnull: "notEmpty",
  checked: "checked", notchecked: "notChecked",
  anyof: "anyOf", in: "anyOf", allof: "allOf", nanyof: "noneOf", noneof: "noneOf", nallof: "notAllOf", notallof: "notAllOf",
};

const LISTS: ConditionOp[] = ["anyOf", "allOf", "noneOf", "notAllOf"];
const COMPARISONS: ConditionOp[] = ["eq", "neq", "gt", "gte", "lt", "lte"];
const DATE_TYPES: FieldType[] = ["date", "datetime", "created", "modified", "formula", "lookup", "rollup"];

/** NocoDB's sub-operators of a date comparison, as the days of the engine ("today-7"). */
const DAY_WORDS: Record<string, string> = {
  today: "today", tomorrow: "today+1", yesterday: "today-1", oneweekago: "today-7", oneweekfromnow: "today+7",
  onemonthago: "today-1m", onemonthfromnow: "today+1m",
};

interface Part {
  text: string;
  start: number;
  end: number;
}

type FieldOf = (name: string) => number | undefined;
type TypeOf = (id: number) => FieldType | undefined;

/** The value of a date comparison: (Due,eq,today), (Due,lt,daysAgo,10), (Due,eq,exactDate,2026-01-15). */
function dayValue(values: string[]): string | undefined {
  const word = values[0]?.toLowerCase() ?? "";
  if (DAY_WORDS[word]) return DAY_WORDS[word];
  if (word === "daysago" || word === "daysfromnow") {
    const n = Number(values[1]);
    if (!Number.isInteger(n) || n < 0) throw new WhereError(`${values[0]} needs a number of days`);
    return `today${word === "daysago" ? "-" : "+"}${n}`;
  }
  if (word === "exactdate") return values[1];
  return undefined;
}

/** (field, isWithin, period[, number | from, to]) as the value of a `within` condition. */
function withinValue(values: string[]): unknown {
  const name = WITHIN_PERIODS.find((p) => p.toLowerCase() === (values[0] ?? "").toLowerCase());
  if (!name) throw new WhereError(`Unknown period "${values[0] ?? ""}"`);
  if (name === "pastNumberOfDays" || name === "nextNumberOfDays") return [name, Number(values[1])];
  if (name === "dateRange") return [name, values[1], values[2]];
  return name;
}

function condition(parts: Part[], src: string, fieldOf: FieldOf, typeOf?: TypeOf): Condition | Filter {
  if (parts.length < 2) throw new WhereError(`"(${parts.map((p) => p.text).join(",")})": expected (field,operator,value)`);
  const name = parts[0]!.text;
  const field = fieldOf(name);
  if (field === undefined) throw new WhereError(`There is no field called "${name}"`);
  const opName = parts[1]!.text.toLowerCase();
  const values = parts.slice(2).map((p) => p.text);
  // one value with commas in it, unquoted: as it was written
  const whole = parts.length > 3 ? src.slice(parts[2]!.start, parts[parts.length - 1]!.end).trim() : values[0];

  if (opName === "btw" || opName === "nbtw") {
    const [from, to] = values;
    if (from === undefined || to === undefined) throw new WhereError(`${opName} needs two values`);
    return opName === "btw"
      ? { join: "and", items: [{ field, op: "gte", value: from }, { field, op: "lte", value: to }] }
      : { join: "or", items: [{ field, op: "lt", value: from }, { field, op: "gt", value: to }] };
  }
  if (opName === "is" || opName === "isnot") {
    const word = (values[0] ?? "null").toLowerCase();
    const yes = opName === "is";
    if (word === "true") return { field, op: yes ? "checked" : "notChecked" };
    if (word === "false") return { field, op: yes ? "notChecked" : "checked" };
    return { field, op: yes ? "empty" : "notEmpty" };
  }
  if (opName === "iswithin") return { field, op: "within", value: withinValue(values) };

  let op = OPS[opName];
  if (!op) throw new WhereError(`Unknown operator "${parts[1]!.text}"`);
  if (LISTS.includes(op)) return { field, op, value: values.filter((v) => v !== "") };
  if (COMPARISONS.includes(op) && values.length > 0) {
    const type = typeOf?.(field);
    const day = type === undefined || DATE_TYPES.includes(type) ? dayValue(values) : undefined;
    if (day !== undefined) return { field, op, value: day };
  }
  let v: string | undefined = whole;
  if ((opName === "like" || opName === "nlike") && v !== undefined) {
    const starts = v.startsWith("%");
    const ends = v.endsWith("%");
    v = v.replace(/^%|%$/g, "");
    if (opName === "like" && ends && !starts) op = "startsWith";
    if (opName === "like" && starts && !ends) op = "endsWith";
  }
  return v === undefined ? { field, op } : { field, op, value: v };
}

/**
 * Reads a `where` text. `fieldOf` finds a field id by name; `typeOf`, when given, tells the sub-operators of
 * dates (today, daysAgo…) from plain words in other fields. Throws WhereError with a sentence for people.
 */
export function parseWhere(where: string, fieldOf: FieldOf, typeOf?: TypeOf): Filter {
  const src = where.trim().replace(/^@/, "");
  let pos = 0;
  const skip = () => {
    while (src[pos] === " ") pos++;
  };

  /** One part of a condition: a quoted text, or the text up to the next comma or closing parenthesis. */
  function part(): Part {
    skip();
    const quote = src[pos];
    if (quote === '"' || quote === "'") {
      const start = pos;
      let text = "";
      pos++;
      while (pos < src.length && src[pos] !== quote) {
        if (src[pos] === "\\" && pos + 1 < src.length) pos++;
        text += src[pos];
        pos++;
      }
      if (pos >= src.length) throw new WhereError("A quote is not closed");
      pos++;
      const end = pos;
      skip();
      return { text, start, end };
    }
    const start = pos;
    let depth = 0;
    for (; pos < src.length; pos++) {
      const c = src[pos];
      if (c === "(") depth++;
      else if (c === ")" && depth-- === 0) break;
      else if (c === "," && depth === 0) break;
    }
    return { text: src.slice(start, pos).trim(), start, end: pos };
  }

  function term(): Condition | Filter {
    skip();
    if (src.startsWith("~not", pos)) {
      pos += 4;
      return { join: "and", items: [term()], not: true };
    }
    if (src[pos] !== "(") throw new WhereError(`Expected "(" at ${pos + 1}`);
    pos++;
    skip();
    if (src[pos] === "(" || src.startsWith("~not", pos)) {
      const inner = expression();
      skip();
      if (src[pos] !== ")") throw new WhereError(`Expected ")" at ${pos + 1}`);
      pos++;
      return inner;
    }
    const parts = [part()];
    while (src[pos] === ",") {
      pos++;
      parts.push(part());
    }
    if (src[pos] !== ")") throw new WhereError("A parenthesis is not closed");
    pos++;
    return condition(parts, src, fieldOf, typeOf);
  }

  function expression(): Filter {
    const ors: (Condition | Filter)[][] = [[term()]];
    for (skip(); src.startsWith("~and", pos) || src.startsWith("~or", pos); skip()) {
      const isOr = src.startsWith("~or", pos);
      pos += isOr ? 3 : 4;
      if (isOr) ors.push([term()]);
      else ors[ors.length - 1]!.push(term());
    }
    const groups = ors.map((items): Condition | Filter => (items.length === 1 ? items[0]! : { join: "and", items }));
    return groups.length === 1 && "items" in groups[0]! ? (groups[0] as Filter) : { join: groups.length === 1 ? "and" : "or", items: groups };
  }

  if (src === "") return { join: "and", items: [] };
  const result = expression();
  skip();
  if (pos !== src.length) throw new WhereError(`Unexpected "${src.slice(pos, pos + 10)}"`);
  return result;
}
