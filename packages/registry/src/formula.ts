// The formulas of the registry: a small language like NocoDB's and Airtable's (docs/anagrafiche.md, §5).
// A hand-written parser and evaluator: nothing is ever passed to eval, and a broken formula gives an empty
// value instead of stopping anything.
//
// References are `{Field name}` when people type them and `{#<field id>}` once saved, so renaming a field
// keeps its formulas working; the two helpers at the end turn one form into the other.

import { addTime, dayText, formatTime, holidaysOf, parseTime, startOf, timeDiff, timeOf, unitOf, weekday, weekdayIndex, weekNumber, workday, workdayDiff } from "./datetime";
import { md5, sha256, sha512 } from "./hash";
import { roundTo } from "./values";

export type FormulaValue = string | number | boolean | null | FormulaValue[];

export type FormulaNode =
  | { k: "num"; v: number }
  | { k: "str"; v: string }
  | { k: "ref"; ref: string }
  | { k: "call"; fn: string; args: FormulaNode[] }
  | { k: "bin"; op: string; l: FormulaNode; r: FormulaNode }
  | { k: "neg"; e: FormulaNode };

export class FormulaError extends Error {}

interface Token {
  t: "num" | "str" | "ref" | "id" | "op" | "(" | ")" | ",";
  v: string;
  at: number;
  end: number;
}

const OPERATORS = ["<=", ">=", "!=", "<>", "==", "=", "<", ">", "+", "-", "*", "/", "&"];

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const start = i;
    if (/[0-9.]/.test(c)) {
      const m = /^\d*\.?\d+(?:[eE][+-]?\d+)?|^\d+\./.exec(src.slice(i));
      if (!m) throw new FormulaError(`Unexpected "${c}" at ${i + 1}`);
      i += m[0].length;
      tokens.push({ t: "num", v: m[0], at: start, end: i });
    } else if (c === '"' || c === "'") {
      let value = "";
      i++;
      while (i < src.length && src[i] !== c) {
        // a backslash escapes the quote and itself; elsewhere it stays (patterns: "\\d{3}")
        if (src[i] === "\\" && (src[i + 1] === c || src[i + 1] === "\\")) i++;
        value += src[i];
        i++;
      }
      if (i >= src.length) throw new FormulaError("A text is not closed");
      i++;
      tokens.push({ t: "str", v: value, at: start, end: i });
    } else if (c === "{") {
      const close = src.indexOf("}", i);
      if (close < 0) throw new FormulaError("A {field} is not closed");
      tokens.push({ t: "ref", v: src.slice(i + 1, close).trim(), at: start, end: close + 1 });
      i = close + 1;
    } else if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      i += m[0].length;
      tokens.push({ t: "id", v: m[0].toUpperCase(), at: start, end: i });
    } else if (c === "(" || c === ")" || c === ",") {
      i++;
      tokens.push({ t: c, v: c, at: start, end: i });
    } else {
      const op = OPERATORS.find((o) => src.startsWith(o, i));
      if (!op) throw new FormulaError(`Unexpected "${c}" at ${i + 1}`);
      i += op.length;
      tokens.push({ t: "op", v: op, at: start, end: i });
    }
  }
  return tokens;
}

const ANY = Infinity;

/** How many arguments each function takes: [at least, at most]. The functions of NocoDB, with its names. */
const FUNCTIONS: Record<string, [number, number]> = {
  // text
  CONCAT: [0, ANY], LEFT: [2, 2], RIGHT: [2, 2], MID: [2, 3], SUBSTR: [2, 3], LEN: [1, 1], LOWER: [1, 1], UPPER: [1, 1], TRIM: [1, 1],
  SEARCH: [2, 2], FIND: [2, 3], SUBSTITUTE: [3, 4], REPLACE: [3, 3], REPEAT: [2, 2], TEXTAFTER: [2, 3], TEXTBEFORE: [2, 3], TEXTSPLIT: [2, 3],
  REGEX_MATCH: [2, 2], REGEX_EXTRACT: [2, 2], REGEX_REPLACE: [3, 3], URL: [1, 1], URLENCODE: [1, 1], MD5: [1, 1], SHA256: [1, 1], SHA512: [1, 1],
  ISBLANK: [1, 1], ISNOTBLANK: [1, 1],
  // logic
  IF: [2, 3], SWITCH: [3, ANY], AND: [1, ANY], OR: [1, ANY], NOT: [1, 1], BLANK: [0, 0], TRUE: [0, 0], FALSE: [0, 0],
  // numbers
  ABS: [1, 1], ADD: [1, ANY], AVG: [1, ANY], CEILING: [1, 1], COUNT: [1, ANY], COUNTA: [1, ANY], COUNTALL: [1, ANY], EVEN: [1, 1], EXP: [1, 1],
  FLOOR: [1, 1], INT: [1, 1], LOG: [1, 2], MAX: [1, ANY], MIN: [1, ANY], MOD: [2, 2], ODD: [1, 1], POWER: [2, 2], ROUND: [1, 2],
  ROUNDDOWN: [1, 2], ROUNDUP: [1, 2], SQRT: [1, 1], SUM: [1, ANY], VALUE: [1, 1],
  // days and moments
  TODAY: [0, 0], NOW: [0, 0], CREATED_TIME: [0, 0], DATEADD: [3, 3], DATETIME_DIFF: [2, 3], DATESTR: [1, 1], DATETIME_FORMAT: [1, 2],
  DATETIME_PARSE: [1, 2], YEAR: [1, 1], MONTH: [1, 1], DAY: [1, 1], HOUR: [1, 1], MINUTE: [1, 1], SECOND: [1, 1], WEEKDAY: [1, 2],
  WEEKNUM: [1, 2], WORKDAY: [2, 3], WORKDAY_DIFF: [2, 3], IS_SAME: [2, 3], IS_BEFORE: [2, 3], IS_AFTER: [2, 3], FROMNOW: [1, 2], TONOW: [1, 2],
  // lists (the values of links and lookups)
  ARRAYJOIN: [1, 2], ARRAYSORT: [1, 2], ARRAYUNIQUE: [1, 1], ARRAYCOMPACT: [1, 1], ARRAYSLICE: [2, 3], ARRAYFLATTEN: [1, ANY],
  // other
  JSON_EXTRACT: [2, 2], RECORD_ID: [0, 0],
};

/** The functions a formula may use, for the help of the editor. */
export const FORMULA_FUNCTIONS = Object.keys(FUNCTIONS);

/** Reads a formula. Throws FormulaError with a sentence for people when it cannot. */
export function parseFormula(src: string): FormulaNode {
  const tokens = tokenize(src);
  let pos = 0;
  const peek = () => tokens[pos];
  const take = () => tokens[pos++];
  const isOp = (...ops: string[]) => peek()?.t === "op" && ops.includes(peek()!.v);

  const binary = (next: () => FormulaNode, ops: string[]) => (): FormulaNode => {
    let left = next();
    while (isOp(...ops)) {
      const op = take()!.v;
      left = { k: "bin", op: op === "<>" ? "!=" : op === "==" ? "=" : op, l: left, r: next() };
    }
    return left;
  };

  function primary(): FormulaNode {
    const token = take();
    if (!token) throw new FormulaError("The formula ends too early");
    if (token.t === "num") return { k: "num", v: Number(token.v) };
    if (token.t === "str") return { k: "str", v: token.v };
    if (token.t === "ref") return { k: "ref", ref: token.v };
    if (token.t === "op" && token.v === "-") return { k: "neg", e: primary() };
    if (token.t === "(") {
      const inner = comparison();
      if (take()?.t !== ")") throw new FormulaError("A parenthesis is not closed");
      return inner;
    }
    if (token.t === "id") {
      const arity = FUNCTIONS[token.v];
      if (!arity) throw new FormulaError(`Unknown function ${token.v}`);
      const args: FormulaNode[] = [];
      if (peek()?.t === "(") {
        take();
        if (peek()?.t !== ")") {
          args.push(comparison());
          while (peek()?.t === ",") {
            take();
            args.push(comparison());
          }
        }
        if (take()?.t !== ")") throw new FormulaError(`${token.v}: a parenthesis is not closed`);
      } else if (token.v !== "TRUE" && token.v !== "FALSE") {
        throw new FormulaError(`${token.v} needs parentheses`);
      }
      if (args.length < arity[0] || args.length > arity[1]) throw new FormulaError(`${token.v}: wrong number of arguments`);
      return { k: "call", fn: token.v, args };
    }
    throw new FormulaError(`Unexpected "${token.v}" at ${token.at + 1}`);
  }

  const term = binary(primary, ["*", "/"]);
  const additive = binary(term, ["+", "-"]);
  const concat = binary(additive, ["&"]);
  const comparison = binary(concat, ["=", "==", "!=", "<>", "<", "<=", ">", ">="]);

  const node = comparison();
  if (pos < tokens.length) throw new FormulaError(`Unexpected "${tokens[pos]!.v}" at ${tokens[pos]!.at + 1}`);
  return node;
}

/** The references of a formula, as written (`Name` or `#12`). */
export function formulaRefs(node: FormulaNode): string[] {
  switch (node.k) {
    case "ref":
      return [node.ref];
    case "call":
      return node.args.flatMap(formulaRefs);
    case "bin":
      return [...formulaRefs(node.l), ...formulaRefs(node.r)];
    case "neg":
      return formulaRefs(node.e);
    default:
      return [];
  }
}

function replaceRefs(src: string, swap: (ref: string) => string | null): string {
  let out = "";
  let last = 0;
  for (const token of tokenize(src)) {
    if (token.t !== "ref") continue;
    const next = swap(token.v);
    if (next === null) continue;
    out += src.slice(last, token.at) + `{${next}}`;
    last = token.end;
  }
  return out + src.slice(last);
}

/**
 * The saved form of a formula typed by a person: `{Name}` becomes `{#12}`. Throws on syntax errors and on
 * names that are not fields of the table.
 */
export function storeExpression(src: string, fields: { id: number; name: string }[]): string {
  parseFormula(src);
  const byName = new Map(fields.map((f) => [f.name.toLowerCase(), f.id]));
  const ids = new Set(fields.map((f) => f.id));
  return replaceRefs(src, (ref) => {
    if (ref.startsWith("#") && ids.has(Number(ref.slice(1)))) return ref;
    const id = byName.get(ref.toLowerCase());
    if (id === undefined) throw new FormulaError(`There is no field called "${ref}"`);
    return `#${id}`;
  });
}

/** The form people read: `{#12}` becomes `{Name}` (a field that no longer exists stays `{#12}`). */
export function showExpression(stored: string, fields: { id: number; name: string }[]): string {
  const byId = new Map(fields.map((f) => [f.id, f.name]));
  try {
    return replaceRefs(stored, (ref) => (ref.startsWith("#") ? (byId.get(Number(ref.slice(1))) ?? null) : null));
  } catch {
    return stored;
  }
}

// --- evaluation ----------------------------------------------------------------------------------

export interface FormulaEnv {
  today: string;
  now: string;
  /** The record being worked out, for RECORD_ID() and CREATED_TIME(). */
  recordId?: number;
  createdAt?: string;
}

const flat = (values: FormulaValue[]): FormulaValue[] => values.flatMap((v) => (Array.isArray(v) ? flat(v) : [v]));
const isBlank = (v: FormulaValue) => v === null || v === "" || (Array.isArray(v) && flat(v).every(isBlank));
const clean = (n: number) => (Number.isFinite(n) ? Math.round(n * 1e10) / 1e10 : null);
/** The items of a value: a list as it is (blanks included), anything else as a list of one. */
const itemsOf = (v: FormulaValue): FormulaValue[] => (Array.isArray(v) ? flat(v) : [v]);

function toNumber(v: FormulaValue): number {
  if (Array.isArray(v)) {
    const items = flat(v).filter((x) => !isBlank(x));
    if (items.length === 0) return 0;
    if (items.length === 1) return toNumber(items[0]!);
    throw new FormulaError("A list where a number is needed");
  }
  if (v === null || v === "") return 0;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") return v;
  const n = Number(v.replace(",", "."));
  if (Number.isNaN(n)) throw new FormulaError("A text where a number is needed");
  return n;
}

function toText(v: FormulaValue): string {
  if (v === null) return "";
  if (Array.isArray(v)) return flat(v).filter((x) => !isBlank(x)).map(toText).join(", ");
  if (typeof v === "number") return String(clean(v) ?? "");
  return String(v);
}

const truthy = (v: FormulaValue) => !isBlank(v) && v !== false && v !== 0;
const finite = (n: number) => {
  if (!Number.isFinite(n)) throw new FormulaError("Not a number");
  return n;
};

const firstText = (v: FormulaValue) => toText(Array.isArray(v) ? (flat(v)[0] ?? null) : v).trim();

function toTime(v: FormulaValue): number {
  const t = timeOf(firstText(v));
  if (Number.isNaN(t)) throw new FormulaError("Not a date");
  return t;
}

/** A day stays a day (YYYY-MM-DD), a moment stays a moment (ISO, UTC). */
const isDayValue = (v: FormulaValue) => /^\d{4}[-/]\d{2}[-/]\d{2}$/.test(firstText(v));
const timeText = (t: number, asDay: boolean) => (asDay ? dayText(t) : new Date(t).toISOString());

function unit(name: string) {
  const u = unitOf(name);
  if (!u) throw new FormulaError(`Unknown unit "${name}"`);
  return u;
}

function startDay(name: string): number {
  const i = weekdayIndex(name);
  if (i === undefined) throw new FormulaError(`Unknown day "${name}"`);
  return i;
}

/** Numbers as numbers, everything else as text: the order of ARRAYSORT and of the comparisons. */
function orderOf(a: FormulaValue, b: FormulaValue): number {
  const numeric = (v: FormulaValue) => typeof v === "number" || typeof v === "boolean";
  if (numeric(a) || numeric(b)) {
    const x = toNumber(a);
    const y = toNumber(b);
    return x < y ? -1 : x > y ? 1 : 0;
  }
  const x = toText(a);
  const y = toText(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

function compare(op: string, a: FormulaValue, b: FormulaValue): boolean {
  const order = orderOf(a, b);
  switch (op) {
    case "=": return order === 0;
    case "!=": return order !== 0;
    case "<": return order < 0;
    case "<=": return order <= 0;
    case ">": return order > 0;
    default: return order >= 0;
  }
}

function numbers(args: FormulaValue[]): number[] {
  return flat(args).filter((v) => !isBlank(v)).map(toNumber);
}

/** A pattern of the person who wrote the formula; a long one is refused, a broken one gives an empty value. */
function pattern(source: string, flags = ""): RegExp {
  if (source.length > 500) throw new FormulaError("The pattern is too long");
  try {
    return new RegExp(source, flags);
  } catch {
    throw new FormulaError("Not a valid pattern");
  }
}

/** Where the n-th `part` starts in `text` (1 the first, -1 the last); -1 when there is none. */
function nth(text: string, part: string, instance: number): number {
  if (part === "" || instance === 0) return -1;
  const places: number[] = [];
  for (let at = text.indexOf(part); at >= 0; at = text.indexOf(part, at + part.length)) places.push(at);
  return places[instance > 0 ? instance - 1 : places.length + instance] ?? -1;
}

/** URLENCODE encodes only these, as NocoDB does. */
const URL_RESERVED = /[ %:/?#[\]@$&+,;=]/g;

function jsonExtract(json: string, path: string): FormulaValue {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new FormulaError("Not valid JSON");
  }
  for (const key of path.replace(/^\$/, "").match(/[^.[\]]+/g) ?? []) {
    if (value === null || typeof value !== "object") return null;
    value = (value as Record<string, unknown>)[key.replace(/^["']|["']$/g, "")];
  }
  if (value === undefined || value === null) return null;
  return typeof value === "object" ? JSON.stringify(value) : (value as FormulaValue);
}

function call(fn: string, args: FormulaNode[], run: (n: FormulaNode) => FormulaValue, env: FormulaEnv): FormulaValue {
  // IF, SWITCH, AND, OR only work out the arguments they need
  if (fn === "IF") return truthy(run(args[0]!)) ? run(args[1]!) : args[2] ? run(args[2]) : null;
  if (fn === "SWITCH") {
    const subject = toText(run(args[0]!));
    for (let i = 1; i + 1 < args.length; i += 2) if (toText(run(args[i]!)) === subject) return run(args[i + 1]!);
    return args.length % 2 === 0 ? run(args[args.length - 1]!) : null;
  }
  if (fn === "AND") return args.every((a) => truthy(run(a)));
  if (fn === "OR") return args.some((a) => truthy(run(a)));
  const v = args.map(run);
  const at = (i: number) => v[i] ?? null;
  const text = (i: number) => toText(at(i));
  const num = (i: number) => toNumber(at(i));
  const blank = (i: number) => isBlank(at(i));
  const time = (i: number) => toTime(at(i));
  const has = (i: number) => v.length > i;
  switch (fn) {
    // text
    case "CONCAT": return v.map(toText).join("");
    case "LEFT": return text(0).slice(0, Math.max(0, num(1)));
    case "RIGHT": return num(1) <= 0 ? "" : text(0).slice(-num(1));
    case "MID":
    case "SUBSTR": {
      const from = Math.max(0, num(1) - 1);
      return has(2) ? text(0).slice(from, from + Math.max(0, num(2))) : text(0).slice(from);
    }
    case "LEN": return text(0).length;
    case "LOWER": return text(0).toLowerCase();
    case "UPPER": return text(0).toUpperCase();
    case "TRIM": return text(0).trim();
    case "SEARCH": return text(0).indexOf(text(1)) + 1;
    case "FIND": return text(1).indexOf(text(0), has(2) ? Math.max(0, num(2) - 1) : 0) + 1;
    case "SUBSTITUTE": {
      if (text(1) === "") return text(0);
      if (!has(3)) return text(0).split(text(1)).join(text(2));
      const place = nth(text(0), text(1), Math.trunc(num(3)));
      return place < 0 ? text(0) : text(0).slice(0, place) + text(2) + text(0).slice(place + text(1).length);
    }
    case "REPLACE": return text(1) === "" ? text(0) : text(0).split(text(1)).join(text(2));
    case "REPEAT": {
      const times = Math.trunc(num(1));
      if (times < 0 || times * text(0).length > 100_000) throw new FormulaError("The text would be too long");
      return text(0).repeat(times);
    }
    case "TEXTAFTER":
    case "TEXTBEFORE": {
      const place = nth(text(0), text(1), has(2) ? Math.trunc(num(2)) : 1);
      if (place < 0) return null;
      return fn === "TEXTAFTER" ? text(0).slice(place + text(1).length) : text(0).slice(0, place);
    }
    case "TEXTSPLIT": {
      const parts = text(1) === "" ? [text(0)] : text(0).split(text(1));
      return has(2) && truthy(at(2)) ? parts.filter((p) => p !== "") : parts;
    }
    case "REGEX_MATCH": return pattern(text(1)).test(text(0)) ? 1 : 0;
    case "REGEX_EXTRACT": {
      const m = pattern(text(1)).exec(text(0));
      return m ? (m[1] ?? m[0]) : null;
    }
    case "REGEX_REPLACE": return text(0).replace(pattern(text(1), "g"), text(2));
    case "URL": return text(0);
    case "URLENCODE": return text(0).replace(URL_RESERVED, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);
    case "MD5": return md5(text(0));
    case "SHA256": return sha256(text(0));
    case "SHA512": return sha512(text(0));
    case "ISBLANK": return blank(0);
    case "ISNOTBLANK": return !blank(0);
    // logic
    case "NOT": return !truthy(at(0));
    case "BLANK": return null;
    case "TRUE": return true;
    case "FALSE": return false;
    // numbers
    case "ABS": return Math.abs(num(0));
    case "ADD":
    case "SUM": return clean(numbers(v).reduce((s, n) => s + n, 0));
    case "AVG": {
      const n = numbers(v);
      return n.length ? clean(n.reduce((s, x) => s + x, 0) / n.length) : null;
    }
    case "CEILING": return Math.ceil(num(0));
    case "FLOOR": return Math.floor(num(0));
    case "INT": return Math.trunc(num(0));
    case "COUNT": return flat(v).filter((x) => typeof x === "number" || (typeof x === "string" && x.trim() !== "" && Number.isFinite(Number(x)))).length;
    case "COUNTA": return flat(v).filter((x) => !isBlank(x)).length;
    case "COUNTALL": return flat(v).length;
    case "EVEN": {
      const up = Math.ceil(Math.abs(num(0)) / 2) * 2;
      return num(0) < 0 ? -up : up;
    }
    case "ODD": {
      let up = Math.ceil(Math.abs(num(0)));
      if (up % 2 === 0) up++;
      return num(0) < 0 ? -up : up;
    }
    case "EXP": return finite(Math.exp(num(0)));
    case "LOG": {
      const [base, n] = has(1) ? [num(0), num(1)] : [Math.E, num(0)];
      if (n <= 0 || base <= 0 || base === 1) throw new FormulaError("No logarithm");
      return clean(Math.log(n) / Math.log(base));
    }
    case "MAX": {
      const n = numbers(v);
      return n.length ? Math.max(...n) : null;
    }
    case "MIN": {
      const n = numbers(v);
      return n.length ? Math.min(...n) : null;
    }
    case "MOD": {
      if (num(1) === 0) throw new FormulaError("Division by zero");
      return clean(num(0) % num(1));
    }
    case "POWER": return finite(num(0) ** num(1));
    case "SQRT": {
      if (num(0) < 0) throw new FormulaError("No square root");
      return Math.sqrt(num(0));
    }
    case "ROUND": return roundTo(num(0), has(1) ? num(1) : 0);
    case "ROUNDDOWN": return roundTo(num(0), has(1) ? num(1) : 0, "floor");
    case "ROUNDUP": return roundTo(num(0), has(1) ? num(1) : 0, "ceil");
    case "VALUE": {
      if (blank(0)) return null;
      if (typeof at(0) === "number") return at(0);
      // the number inside a text: VALUE("USD -45.67") = -45.67
      const m = /-?\d+(?:[.,]\d+)?/.exec(text(0));
      if (!m) throw new FormulaError("No number in the text");
      return Number(m[0].replace(",", "."));
    }
    // days and moments
    case "TODAY": return env.today;
    case "NOW": return env.now;
    case "CREATED_TIME": return env.createdAt ?? null;
    case "DATEADD": {
      if (blank(0)) return null;
      const u = unit(text(2));
      return timeText(addTime(time(0), num(1), u), isDayValue(at(0)) && !["ms", "second", "minute", "hour"].includes(u));
    }
    case "DATETIME_DIFF": return blank(0) || blank(1) ? null : timeDiff(time(0), time(1), unit(has(2) ? text(2) : "day"));
    case "DATESTR": return blank(0) ? null : dayText(time(0));
    case "DATETIME_FORMAT": return blank(0) ? null : formatTime(time(0), has(1) ? text(1) : undefined);
    case "DATETIME_PARSE": {
      if (blank(0)) return null;
      const parsed = parseTime(text(0), has(1) ? text(1) : undefined);
      if (!parsed) throw new FormulaError("Not a date");
      return timeText(parsed.t, !parsed.hasTime);
    }
    case "YEAR": return blank(0) ? null : new Date(time(0)).getUTCFullYear();
    case "MONTH": return blank(0) ? null : new Date(time(0)).getUTCMonth() + 1;
    case "DAY": return blank(0) ? null : new Date(time(0)).getUTCDate();
    case "HOUR": return blank(0) ? null : new Date(time(0)).getUTCHours();
    case "MINUTE": return blank(0) ? null : new Date(time(0)).getUTCMinutes();
    case "SECOND": return blank(0) ? null : new Date(time(0)).getUTCSeconds();
    // 0 for the first day of the week: Monday, unless told
    case "WEEKDAY": return blank(0) ? null : weekday(time(0), has(1) ? startDay(text(1)) : 1);
    case "WEEKNUM": return blank(0) ? null : weekNumber(time(0), has(1) ? startDay(text(1)) : 0);
    case "WORKDAY": {
      if (blank(0)) return null;
      if (Math.abs(num(1)) > 100_000) throw new FormulaError("Too many days");
      return dayText(workday(time(0), num(1), holidaysOf(has(2) ? itemsOf(at(2)) : [])));
    }
    case "WORKDAY_DIFF": return blank(0) || blank(1) ? null : workdayDiff(time(0), time(1), holidaysOf(has(2) ? itemsOf(at(2)) : []));
    case "IS_SAME":
    case "IS_BEFORE":
    case "IS_AFTER": {
      if (blank(0) || blank(1)) return null;
      const u = has(2) ? unit(text(2)) : undefined;
      const a = u ? startOf(time(0), u) : time(0);
      const b = u ? startOf(time(1), u) : time(1);
      return fn === "IS_SAME" ? a === b : fn === "IS_BEFORE" ? a < b : a > b;
    }
    case "FROMNOW":
    case "TONOW": return blank(0) ? null : Math.abs(timeDiff(timeOf(env.now), time(0), unit(has(1) ? text(1) : "day")));
    // lists
    case "ARRAYJOIN": return itemsOf(at(0)).filter((x) => !isBlank(x)).map(toText).join(has(1) ? text(1) : ", ");
    case "ARRAYSORT": {
      const sorted = itemsOf(at(0)).filter((x) => !isBlank(x)).sort(orderOf);
      return has(1) && text(1).toLowerCase() === "desc" ? sorted.reverse() : sorted;
    }
    case "ARRAYUNIQUE": return [...new Map(itemsOf(at(0)).map((x) => [`${typeof x}:${toText(x)}`, x])).values()];
    case "ARRAYCOMPACT": return itemsOf(at(0)).filter((x) => !isBlank(x));
    case "ARRAYSLICE": {
      const list = itemsOf(at(0));
      const start = num(1);
      const end = has(2) ? num(2) : list.length;
      return start < 1 || end < start ? null : list.slice(start - 1, end);
    }
    case "ARRAYFLATTEN": return flat(v);
    // other
    case "JSON_EXTRACT": return blank(0) ? null : jsonExtract(text(0), text(1));
    case "RECORD_ID": return env.recordId ?? null;
    default: throw new FormulaError(`Unknown function ${fn}`);
  }
}

/**
 * Works out a formula. `resolve` gives the value of a reference. Any failure inside (a text where a number is
 * needed, a division by zero) makes the whole result empty.
 */
export function evaluateFormula(node: FormulaNode, resolve: (ref: string) => FormulaValue, env: FormulaEnv): FormulaValue {
  const run = (n: FormulaNode): FormulaValue => {
    switch (n.k) {
      case "num": return n.v;
      case "str": return n.v;
      case "ref": return resolve(n.ref);
      case "neg": return -toNumber(run(n.e));
      case "call": return call(n.fn, n.args, run, env);
      case "bin": {
        const l = run(n.l);
        const r = run(n.r);
        switch (n.op) {
          case "+": return clean(toNumber(l) + toNumber(r));
          case "-": return clean(toNumber(l) - toNumber(r));
          case "*": return clean(toNumber(l) * toNumber(r));
          case "/": {
            if (toNumber(r) === 0) throw new FormulaError("Division by zero");
            return clean(toNumber(l) / toNumber(r));
          }
          case "&": return toText(l) + toText(r);
          default: return compare(n.op, l, r);
        }
      }
    }
  };
  try {
    return run(node);
  } catch (error) {
    if (error instanceof FormulaError || error instanceof RangeError) return null;
    throw error;
  }
}
