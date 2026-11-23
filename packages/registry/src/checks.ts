import { FormulaError, formulaRefs, parseFormula } from "./formula";
import { BARCODE_FORMATS, DURATION_FORMATS, isComputed, ROLLUP_FNS, type Field, type RegistrySnapshot } from "./types";
import { fieldNameProblem, normalizeValue, VALUE_LIMITS } from "./values";

// Whether a field can be saved as it is described: the options of its type, what it points at, no formula
// that ends up depending on itself. Called by the API before every change of a field.

/** Types that can be unique: the ones compared as one value. */
export const UNIQUE_TYPES = ["text", "email", "url", "phone", "number", "date", "datetime", "time", "duration", "select", "color", "geodata"];

/** Types a default value is for (links, files and the worked-out ones have none). */
const DEFAULT_TYPES = ["text", "longtext", "email", "url", "phone", "number", "rating", "checkbox", "date", "datetime", "time", "duration", "select", "multiselect", "geodata", "color", "json", "user"];

/** Why the default value of a field cannot be, or null. "today", "now" and "@me" only where they mean something. */
function defaultProblem(field: Field): string | null {
  const d = field.options.default;
  if (d === undefined || d === null || d === "") return null;
  if (!DEFAULT_TYPES.includes(field.type)) return `A field of type ${field.type} has no default value`;
  if (field.unique) return "A unique field cannot have a default value: every new record would have the same";
  if (d === "today") return ["date", "datetime"].includes(field.type) ? null : "today is a default for dates";
  if (d === "now") return field.type === "datetime" ? null : "now is a default for a date and time";
  if (d === "@me") return ["user", "email", "text"].includes(field.type) ? null : "@me is a default for a user, an email or a text";
  // a user default is a fixed person: the API checks that the account exists
  const result = normalizeValue({ ...field, options: { ...field.options, default: undefined } }, d);
  return result.ok ? null : `Default value: ${result.error}`;
}

export function fieldProblem(snapshot: RegistrySnapshot, field: Field): string | null {
  const nameProblem = fieldNameProblem(field.name);
  if (nameProblem) return nameProblem;
  const siblings = snapshot.fields.filter((f) => f.tableId === field.tableId && f.id !== field.id);
  if (siblings.some((f) => f.name.trim().toLowerCase() === field.name.trim().toLowerCase())) return `There is already a field called "${field.name}"`;
  if (isComputed(field.type) && field.required) return `${field.name} is worked out: it cannot be required`;
  if (field.unique && !UNIQUE_TYPES.includes(field.type)) return `A field of type ${field.type} cannot be unique`;
  const badDefault = defaultProblem(field);
  if (badDefault) return badDefault;

  const o = field.options;
  const byId = new Map(snapshot.fields.map((f) => [f.id, f]));
  switch (field.type) {
    case "duration":
      if (o.durationFormat !== undefined && !DURATION_FORMATS.includes(o.durationFormat)) return "Unknown duration format";
      return null;
    case "button":
      return o.url ? formulaProblem(snapshot, field, o.url, byId) : null;
    case "qrcode":
    case "barcode": {
      const source = byId.get(o.fieldId ?? 0);
      if (!source || source.tableId !== field.tableId || source.id === field.id) return "Choose the field of this table the code shows";
      if (["qrcode", "barcode", "attachment", "button"].includes(source.type)) return "A code shows a value: not a file, a button or another code";
      if (field.type === "barcode" && o.barcodeFormat !== undefined && !BARCODE_FORMATS.includes(o.barcodeFormat)) return "Unknown kind of barcode";
      return null;
    }
    case "text":
    case "longtext":
      if (o.maxLength !== undefined && (!Number.isInteger(o.maxLength) || o.maxLength < 1 || o.maxLength > VALUE_LIMITS[field.type])) {
        return `The maximum length is from 1 to ${VALUE_LIMITS[field.type]}`;
      }
      return null;
    case "number":
      if (o.precision !== undefined && (!Number.isInteger(o.precision) || o.precision < 0 || o.precision > 6)) return "Decimals go from 0 to 6";
      if (o.min !== undefined && o.max !== undefined && o.min > o.max) return "The minimum is above the maximum";
      return null;
    case "rating":
      if (o.max !== undefined && (!Number.isInteger(o.max) || o.max < 1 || o.max > 10)) return "A rating goes up to 1–10";
      return null;
    case "select":
    case "multiselect": {
      const names = (o.choices ?? []).map((c) => c.name.trim());
      if (names.length === 0) return "Add at least one choice";
      if (names.length > 500) return "At most 500 choices";
      if (names.some((n) => n === "" || n.length > 100)) return "A choice needs a name of at most 100 characters";
      if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) return "Two choices have the same name";
      return null;
    }
    case "link":
      if (!snapshot.tables.some((t) => t.id === o.tableId)) return "Choose the table to link to";
      return null;
    case "lookup":
    case "rollup": {
      const link = byId.get(o.linkFieldId ?? 0);
      if (!link || link.type !== "link" || link.tableId !== field.tableId) return "Choose a link field of this table";
      const target = byId.get(o.fieldId ?? 0);
      if (field.type === "rollup" && (o.fn ?? "count") === "count") return null;
      if (!target || target.tableId !== link.options.tableId) return "Choose a field of the linked table";
      if (field.type === "rollup" && !ROLLUP_FNS.includes(o.fn ?? "count")) return "Unknown summary";
      return null;
    }
    case "formula":
      return formulaProblem(snapshot, field, o.expression ?? "", byId);
    case "attachment":
      if (o.maxSizeMb !== undefined && (o.maxSizeMb <= 0 || o.maxSizeMb > 50)) return "A file can be at most 50 MB";
      if (o.maxFiles !== undefined && (!Number.isInteger(o.maxFiles) || o.maxFiles < 1 || o.maxFiles > 50)) return "From 1 to 50 files";
      return null;
    default:
      return null;
  }
}

/** Why a formula (of a formula field, or the address of a button) cannot be: syntax, unknown fields, a loop. */
function formulaProblem(snapshot: RegistrySnapshot, field: Field, expression: string, byId: Map<number, Field>): string | null {
  let refs: string[];
  try {
    refs = formulaRefs(parseFormula(expression));
  } catch (error) {
    return error instanceof FormulaError ? `Formula: ${error.message}` : "The formula cannot be read";
  }
  for (const ref of refs) {
    const target = ref.startsWith("#") ? byId.get(Number(ref.slice(1))) : undefined;
    if (!target || target.tableId !== field.tableId) return `Formula: there is no field "${ref}"`;
  }
  if (field.type !== "formula") return null;
  // a formula that, through other formulas, uses itself
  const all = new Map([...byId].filter(([, f]) => f.tableId === field.tableId));
  all.set(field.id, field);
  const seen = new Set<number>();
  const visit = (id: number, path: number[]): boolean => {
    if (path.includes(id)) return true;
    const f = all.get(id);
    if (!f || f.type !== "formula" || seen.has(id)) return false;
    seen.add(id);
    let deps: string[] = [];
    try {
      deps = formulaRefs(parseFormula(f.options.expression ?? ""));
    } catch {
      return false;
    }
    return deps.some((r) => r.startsWith("#") && visit(Number(r.slice(1)), [...path, id]));
  };
  return visit(field.id, []) ? "Formula: it ends up using itself" : null;
}
