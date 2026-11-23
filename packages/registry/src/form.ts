import type { Viewer } from "./access";
import { openRegistry, withDraft } from "./compute";
import { matches, resolveDay, type FilterEnv } from "./filter";
import { isComputed, type Field, type FormConfig, type FormField, type RecordRow, type RegistrySnapshot, type Table } from "./types";
import { defaultOf, isEmptyValue, normalizeValue } from "./values";

// What a submitted form writes (docs/anagrafiche.md, §8): the answers to the questions it shows, checked
// with the rules of their fields, plus the values the form sets by itself. That the records and files exist,
// unique values and permissions are checked by the API on the way to the database, like any other write.

export interface FormError {
  fieldId: number | null;
  message: string;
}

export type FormPlan = { ok: true; changes: Record<number, unknown> } | { ok: false; errors: FormError[] };

/** Why the form cannot be filled in today, or null. */
export function formClosedReason(form: FormConfig, today: string): string | null {
  if (form.opensOn && today < form.opensOn) return `This form opens on ${form.opensOn}`;
  if (form.closesOn && today > form.closesOn) return "This form is closed";
  return null;
}

export interface FormEnv {
  viewer: Viewer;
  today: string;
  now: string;
}

function special(field: Field, value: unknown, env: FormEnv, peopleTableId: number | null): unknown {
  if (value === "today") return field.type === "datetime" ? env.now : env.today;
  if (value === "now") return field.type === "date" ? env.today : env.now;
  if (value === "@me") {
    if (field.type === "link") return field.options.tableId === peopleTableId && env.viewer.personId !== null ? [env.viewer.personId] : [];
    if (field.type === "user") return env.viewer.userId === null ? [] : [env.viewer.userId];
    return env.viewer.email;
  }
  return value;
}

/** Why an answer fails the checks of its question (length, pattern, range), or null. */
export function validationError(q: FormField, field: Field, value: unknown, today: string): string | null {
  const v = q.validate;
  if (!v || isEmptyValue(value)) return null;
  const say = (fallback: string) => v.message?.trim() || `${q.label ?? field.name}: ${fallback}`;
  if (typeof value === "string") {
    if (v.minLength !== undefined && value.length < v.minLength) return say(`at least ${v.minLength} characters`);
    if (v.maxLength !== undefined && value.length > v.maxLength) return say(`at most ${v.maxLength} characters`);
    if (v.pattern) {
      let fits = true;
      try {
        fits = new RegExp(v.pattern).test(value);
      } catch {
        // a broken pattern is refused when the form is saved
      }
      if (!fits) return say("not in the expected form");
    }
  }
  const bound = (b: number | string) => (typeof b === "string" ? String(resolveDay(b, today)) : b);
  const compare = (a: unknown, b: number | string) => {
    if (typeof a === "number") return a - Number(b);
    const x = String(a).slice(0, 10);
    return x < String(b) ? -1 : x > String(b) ? 1 : 0;
  };
  if (v.min !== undefined && compare(value, bound(v.min)) < 0) return say(`at least ${bound(v.min)}`);
  if (v.max !== undefined && compare(value, bound(v.max)) > 0) return say(`at most ${bound(v.max)}`);
  return null;
}

/**
 * Plans a submission. `answers` are by field id; `base` is the record a form of the `update` kind changes
 * (null for `create`). Returns the values to write, by field id, or every reason it cannot be accepted.
 */
export function planSubmission(snapshot: RegistrySnapshot, table: Table, form: FormConfig, answers: Record<string, unknown>, base: RecordRow | null, env: FormEnv): FormPlan {
  const fields = new Map(snapshot.fields.filter((f) => f.tableId === table.id).map((f) => [f.id, f]));
  const errors: FormError[] = [];
  const asked = form.fields.filter((q) => {
    const f = fields.get(q.fieldId);
    return f !== undefined && !isComputed(f.type);
  });

  const given = new Map<number, unknown>();
  for (const q of asked) {
    if (!(String(q.fieldId) in answers)) continue;
    const field = fields.get(q.fieldId)!;
    const result = normalizeValue(field, answers[String(q.fieldId)]);
    const problem = result.ok ? validationError(q, field, result.value, env.today) : result.error;
    if (result.ok && !problem) given.set(q.fieldId, result.value);
    else errors.push({ fieldId: q.fieldId, message: problem! });
  }

  const draftOf = (values: Map<number, unknown>): RegistrySnapshot => {
    const draft: RecordRow = base
      ? { ...base, data: { ...base.data } }
      : { id: -1, tableId: table.id, data: {}, version: 0, createdAt: env.now, createdBy: env.viewer.userId, updatedAt: env.now, updatedBy: env.viewer.userId };
    const links: Record<number, number[]> = {};
    for (const [id, value] of values) {
      if (fields.get(id)!.type === "link") links[id] = (value as number[] | null) ?? [];
      else draft.data[String(id)] = value;
    }
    return withDraft(snapshot, draft, links);
  };
  const filterEnv: FilterEnv = { today: env.today, peopleTableId: snapshot.settings.peopleTableId, me: { email: env.viewer.email, personId: env.viewer.personId } };
  const draftRecord = (s: RegistrySnapshot) => s.records.find((r) => r.id === (base?.id ?? -1))!;

  // a question shown only if the answers match its condition: answers to hidden questions are dropped
  // (twice: hiding one question can hide another that depends on it)
  let shown: FormField[] = asked;
  for (let pass = 0; pass < 2; pass++) {
    const s = draftOf(new Map([...given].filter(([id]) => shown.some((q) => q.fieldId === id))));
    const reg = openRegistry(s);
    shown = asked.filter((q) => !q.showIf || matches(reg, draftRecord(s), q.showIf, filterEnv));
  }
  const kept = new Map([...given].filter(([id]) => shown.some((q) => q.fieldId === id)));

  // the values the form sets by itself, in order, each only if its condition holds on the answers
  const changes = new Map(kept);
  for (const rule of form.set ?? []) {
    const field = fields.get(rule.fieldId);
    if (!field || isComputed(field.type)) continue;
    if (rule.when) {
      const s = draftOf(changes);
      if (!matches(openRegistry(s), draftRecord(s), rule.when, filterEnv)) continue;
    }
    const result = normalizeValue(field, special(field, rule.value, env, snapshot.settings.peopleTableId));
    if (result.ok) changes.set(field.id, result.value);
    else errors.push({ fieldId: field.id, message: result.error });
  }

  // what must not stay empty: the required questions, and the required fields of the table (a new record
  // gets the defaults of the fields not given, as the API will write them)
  const withDefaults = new Map(changes);
  if (!base) {
    const ctx = { today: env.today, now: env.now, userId: env.viewer.userId, email: env.viewer.email };
    for (const f of fields.values()) {
      if (withDefaults.has(f.id) || f.type === "link") continue;
      const d = defaultOf(f, ctx);
      const result = d === undefined ? null : normalizeValue(f, d);
      if (result?.ok) withDefaults.set(f.id, result.value);
    }
  }
  const final = draftOf(withDefaults);
  const reg = openRegistry(final);
  const record = draftRecord(final);
  const empty = (f: Field) => {
    const v = reg.value(record, f);
    return isEmptyValue(v) || (f.type === "checkbox" && v === false);
  };
  // files are not answers here: the API checks them, with the files that come with the form
  for (const q of shown) {
    const f = fields.get(q.fieldId)!;
    if (f.type === "attachment") continue;
    if ((q.required || f.required) && empty(f) && !errors.some((e) => e.fieldId === f.id)) errors.push({ fieldId: f.id, message: `${q.label ?? f.name} is required` });
  }
  for (const f of fields.values()) {
    if (f.required && !isComputed(f.type) && f.type !== "attachment" && !shown.some((q) => q.fieldId === f.id) && empty(f)) errors.push({ fieldId: f.id, message: `${f.name} is required` });
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, changes: Object.fromEntries(changes) };
}
