import { ACCESS_LEVELS, BARCODE_FORMATS, CONDITION_OPS, DURATION_FORMATS, FIELD_TYPES, FORM_TARGETS, NUMBER_FORMATS, ROLLUP_FNS, TEXT_TRANSFORMS, VIEW_TYPES, type Filter } from "@erp/registry";
import { z } from "zod";
import { id, isoDate, shortText } from "../../core/validation";

// What the registry API accepts (docs/anagrafiche.md, §10). Shapes only: what a field, a filter or a form
// means is checked by the engine (packages/registry) and by the services.

const noNul = (value: string) => !value.includes("\u0000");
const text = (max: number) => z.string().max(max).refine(noNul, "The text contains a character that is not allowed");
/** A table, a field or a view, by id or by name. */
const ref = z.union([id, shortText(200)]);

const condition = z.object({ field: ref, op: z.enum(CONDITION_OPS), value: z.unknown().optional() });
export const filterInput: z.ZodType<Filter | { join: "and" | "or"; items: unknown[]; not?: boolean }> = z.lazy(() =>
  z.object({ join: z.enum(["and", "or"]), items: z.array(z.union([condition, filterInput])).max(50), not: z.boolean().optional() }),
);

const choice = z.object({ name: shortText(100), color: text(20).optional() });

export const fieldOptionsInput = z
  .object({
    maxLength: z.number().int().positive().optional(),
    transform: z.enum(TEXT_TRANSFORMS).optional(),
    rich: z.boolean().optional(),
    defaultPrefix: z.string().max(5).regex(/^\+\d{1,4}$/, "A prefix like +39").optional(),
    precision: z.number().int().min(0).max(6).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    format: z.enum(NUMBER_FORMATS).optional(),
    symbol: text(5).optional(),
    choices: z.array(choice).max(500).optional(),
    tableId: ref.optional(),
    multiple: z.boolean().optional(),
    linkFieldId: ref.optional(),
    fieldId: ref.optional(),
    fn: z.enum(ROLLUP_FNS).optional(),
    expression: text(5_000).optional(),
    accept: z.array(text(100)).max(20).optional(),
    maxSizeMb: z.number().positive().max(50).optional(),
    maxFiles: z.number().int().min(1).max(50).optional(),
    label: text(60).optional(),
    webhookId: id.optional(),
    /** A button that opens an address: the formula that makes it (`"https://…/" & {Id}`). */
    url: text(2_000).optional(),
    durationFormat: z.enum(DURATION_FORMATS).optional(),
    limitViewId: id.optional(),
    barcodeFormat: z.enum(BARCODE_FORMATS).optional(),
    /** The value of new records: fixed, or "today", "now", "@me". */
    default: z.unknown().optional(),
  })
  .strict();

export const createTableInput = z.object({
  name: shortText(100),
  description: text(2_000).optional(),
  icon: text(8).optional(),
  section: text(100).optional(),
});

const accessWho = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("everyone") }),
  z.object({ kind: z.literal("group"), groupId: id }),
  z.object({ kind: z.literal("self"), linkFieldId: ref.optional() }),
]);
const accessRule = z.object({ who: accessWho, level: z.enum(ACCESS_LEVELS), hidden: z.array(ref).max(500).optional(), readOnly: z.array(ref).max(500).optional() });

export const updateTableInput = createTableInput.partial().extend({
  primaryFieldId: ref.optional(),
  access: z.array(accessRule).max(50).optional(),
  position: z.number().int().min(0).max(10_000).optional(),
});

export const createFieldInput = z.object({
  name: shortText(100),
  type: z.enum(FIELD_TYPES),
  options: fieldOptionsInput.optional(),
  required: z.boolean().optional(),
  unique: z.boolean().optional(),
  description: text(2_000).optional(),
  /** A link: the name of the field made on the other side (by default the name of this table). */
  inverseName: shortText(100).optional(),
  /** A link: whether the other side holds many records (by default yes). */
  inverseMultiple: z.boolean().optional(),
});
export const updateFieldInput = createFieldInput.omit({ inverseName: true, inverseMultiple: true }).partial();
export const orderInput = z.object({ ids: z.array(id).max(1_000) });

const formValidation = z.object({
  minLength: z.number().int().min(0).max(100_000).optional(),
  maxLength: z.number().int().min(1).max(100_000).optional(),
  pattern: text(500).optional(),
  min: z.union([z.number(), text(20)]).optional(),
  max: z.union([z.number(), text(20)]).optional(),
  message: text(300).optional(),
});
const formField = z.object({ fieldId: ref, label: text(200).optional(), help: text(2_000).optional(), required: z.boolean().optional(), showIf: filterInput.optional(), validate: formValidation.optional() });
const formSet = z.object({ fieldId: ref, value: z.unknown(), when: filterInput.optional() });
const formAccess = z.discriminatedUnion("kind", [z.object({ kind: z.literal("public") }), z.object({ kind: z.literal("members") }), z.object({ kind: z.literal("group"), groupId: id })]);
export const formConfigInput = z.object({
  access: formAccess,
  mode: z.enum(["create", "update"]),
  target: z.enum(FORM_TARGETS).optional(),
  pickViewId: id.optional(),
  title: text(200).optional(),
  description: text(5_000).optional(),
  fields: z.array(formField).max(200),
  set: z.array(formSet).max(50).optional(),
  submitLabel: text(50).optional(),
  successMessage: text(5_000).optional(),
  redirectUrl: z.url({ protocol: /^https?$/ }).max(2_000).optional(),
  opensOn: isoDate.optional(),
  closesOn: isoDate.optional(),
  prefill: z.union([z.boolean(), z.enum(["hide", "lock"])]).optional(),
  submitAnother: z.boolean().optional(),
  blankAfter: z.boolean().optional(),
  survey: z.boolean().optional(),
});

const sortInput = z.object({ field: ref, dir: z.enum(["asc", "desc"]) });
export const viewConfigInput = z.object({
  filter: filterInput.optional(),
  sorts: z.array(sortInput).max(10).optional(),
  hidden: z.array(ref).max(500).optional(),
  order: z.array(ref).max(500).optional(),
  widths: z.record(z.string(), z.number().int().min(40).max(2_000)).optional(),
  groupBy: z.union([ref, z.array(ref).min(1).max(5)]).optional(),
  rowHeight: z.enum(["short", "medium", "tall", "extra"]).optional(),
  frozen: z.number().int().min(0).max(10).optional(),
  colorBy: ref.optional(),
  colors: z.array(z.object({ filter: filterInput, color: text(20) })).max(20).optional(),
  locked: z.boolean().optional(),
  description: text(2_000).optional(),
  dependencyField: ref.optional(),
  geoField: ref.optional(),
  folder: text(100).optional(),
  coverField: ref.optional(),
  dateField: ref.optional(),
  endDateField: ref.optional(),
  group: z.boolean().optional(),
  shared: z.boolean().optional(),
  /** A password for the shared view (stored hashed); null or "" takes it away; left out, it stays. */
  sharedPassword: z.string().max(200).nullable().optional(),
  sharedDownload: z.boolean().optional(),
  form: formConfigInput.optional(),
});
const slug = z.string().max(64).trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/, "Letters, digits and dashes (it is part of an address)");
export const createViewInput = z.object({ name: shortText(100), type: z.enum(VIEW_TYPES), config: viewConfigInput.optional(), slug: slug.nullable().optional() });
export const updateViewInput = createViewInput.omit({ type: true }).partial().extend({ position: z.number().int().min(0).max(10_000).optional() });

export const recordsQuery = z.object({
  view: ref.optional(),
  /** A filter as JSON (the site), or `where` in the syntax of NocoDB (the automations). */
  filter: z.string().max(20_000).optional(),
  where: z.string().max(5_000).optional(),
  /** Field names separated by commas, a minus in front for the descending order: `-Date,Name`. */
  sort: z.string().max(2_000).optional(),
  fields: z.string().max(5_000).optional(),
  q: z.string().max(200).optional(),
  /** One field or several, separated by commas: the levels of the grouping. */
  groupBy: z.string().max(1_000).optional(),
  /** Summaries over every record that matches: `sum:Amount,avg:Rating,count:Email`. */
  aggregate: z.string().max(2_000).optional(),
  limit: z.coerce.number().int().min(0).max(1_000).default(100),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  /** NocoDB's paging: `page` from 1 with `pageSize` records (they win over offset and limit). */
  page: z.coerce.number().int().min(1).max(1_000_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(1_000).optional(),
  /** `id`: the fields of each record by id instead of by name (for who renames fields). */
  fieldKey: z.enum(["name", "id"]).default("name"),
});

const values = z.record(z.string().max(200), z.unknown());
export const createRecordsInput = z.union([z.object({ fields: values }), z.array(z.object({ fields: values })).min(1).max(1_000)]);
export const updateRecordInput = z.object({ fields: values, version: id.optional() });
export const updateRecordsInput = z.array(z.object({ id, fields: values, version: id.optional() })).min(1).max(1_000);
export const idsInput = z.object({ ids: z.array(id).max(1_000) });
export const idsQuery = z.object({ ids: z.string().max(20_000).regex(/^\d+(,\d+)*$/, "Ids separated by commas") });

const headerName = z.string().max(100).regex(/^[A-Za-z0-9-]+$/, "A header name: letters, digits and dashes");
export const webhookInput = z.object({
  name: shortText(100),
  url: z.url({ protocol: /^https?$/ }).max(2_000),
  events: z.array(z.enum(["create", "update", "delete", "button", "comment"])).min(1),
  filter: filterInput.nullable().optional(),
  active: z.boolean().optional(),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional(),
  headers: z.record(headerName, text(2_000)).refine((h) => Object.keys(h).length <= 20, "At most 20 headers").optional(),
  /** A template of the body (Handlebars-like); null or "" sends the whole event. */
  body: text(20_000).nullable().optional(),
  /** An update calls it only if one of these fields changed. */
  fields: z.array(ref).max(100).optional(),
  when: z.enum(["matches", "becomes"]).optional(),
});
export const updateWebhookInput = webhookInput.partial();

export const settingsInput = z.object({ peopleTableId: id.nullable(), emailFieldId: id.nullable() });

const uploaded = z.object({ name: shortText(200), mime: text(100), data: z.base64() });
export const submitInput = z.object({
  answers: values,
  files: z.record(z.string().max(200), z.array(uploaded).max(20)).optional(),
  /** A form that changes a record picked from a view: which one. */
  recordId: id.optional(),
  /** A form opened from a personal link: its key. */
  token: z.string().max(200).optional(),
});
export const linkInput = z.object({ recordId: id, days: z.number().int().min(1).max(365).default(14) });

export const importInput = z.object({
  csv: z.string().max(20_000_000),
  /** `create` adds every row; `upsert` changes the record with the same value of `key`, or adds one. */
  mode: z.enum(["create", "upsert"]).default("create"),
  key: shortText(200).optional(),
  dryRun: z.boolean().default(true),
});

export const fileQuery = z.object({ name: shortText(200) });
export const commentInput = z.object({ text: z.string().trim().min(1).max(5_000).refine(noNul, "The text contains a character that is not allowed") });
export const commentEditInput = commentInput;
export const resolveInput = z.object({ resolved: z.boolean() });

/** NocoDB's upsert: the records with the same value of the `match` fields are changed, the others added. */
export const upsertInput = z.object({ match: z.array(ref).min(1).max(5), records: z.array(z.object({ fields: values })).min(1).max(1_000) });

/** The records a bulk change is for: the ones of a view, a filter, a where, a search, or the ids given. */
export const bulkInput = z.object({
  view: ref.optional(),
  filter: filterInput.optional(),
  where: z.string().max(5_000).optional(),
  q: z.string().max(200).optional(),
  ids: z.array(id).max(10_000).optional(),
  /** Only for the update: the values every record gets. */
  fields: values.optional(),
});

export const duplicateInput = z.object({ name: shortText(100).optional(), records: z.boolean().default(false) });
export const viewFiltersInput = z.object({ filter: filterInput.nullable() });
export const viewSortsInput = z.object({ sorts: z.array(sortInput).max(10) });

/** A new table from a CSV (or an Excel sheet turned into CSV by the site): the first row names the fields. */
export const tableImportInput = z.object({
  name: shortText(100),
  section: text(100).optional(),
  csv: z.string().min(1).max(20_000_000),
});
