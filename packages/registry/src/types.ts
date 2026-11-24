// The shapes of the registry: what a table, a field, a view and a record are. Plain data, the same the
// API loads from the database and sends to the site (docs/anagrafiche.md, §3 and §4).

/** Every kind of field. The stored ones keep a value in the record; the others are worked out. */
export const FIELD_TYPES = [
  "text", "longtext", "email", "url", "phone", "number", "rating", "checkbox", "date", "datetime",
  "time", "duration", "select", "multiselect", "link", "lookup", "rollup", "formula", "attachment", "json", "button",
  "geodata", "color", "user", "uuid", "qrcode", "barcode", "autonumber", "created", "modified", "creator", "modifier",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

/** Fields whose value is worked out, given by the server (uuid) or none (button): nobody writes them. */
export const COMPUTED_TYPES: readonly FieldType[] = ["lookup", "rollup", "formula", "button", "uuid", "qrcode", "barcode", "autonumber", "created", "modified", "creator", "modifier"];
export const isComputed = (type: FieldType) => COMPUTED_TYPES.includes(type);
/**
 * The fields that can be the name of the records (what links, titles and cards show): one value that reads as a name: a text, a
 * number, a date, a choice, a formula… Not the ones that hold many values (a link, a lookup, a rollup, several choices, a person), a
 * file, a button, JSON, a coordinate, a colour, a code or a tick.
 */
export const NAME_TYPES: readonly FieldType[] = ["text", "longtext", "email", "url", "phone", "number", "date", "datetime", "time", "duration", "select", "formula", "autonumber", "uuid", "created", "modified", "creator", "modifier"];
export const canBeName = (type: FieldType) => NAME_TYPES.includes(type);
/** Fields whose value is kept in `reg_record.data`: the written ones (links in `reg_link`, with nothing in data) and the uuid. */
export const isStored = (type: FieldType) => type === "uuid" || (!isComputed(type) && type !== "link");

/** How a duration is written: hours and minutes, with seconds, with tenths, hundredths or thousandths of a second. */
export const DURATION_FORMATS = ["h:mm", "h:mm:ss", "h:mm:ss.s", "h:mm:ss.ss", "h:mm:ss.sss"] as const;
export type DurationFormat = (typeof DURATION_FORMATS)[number];

/** The kinds of barcode NocoDB draws (with JsBarcode's names). */
export const BARCODE_FORMATS = ["CODE128", "EAN13", "EAN8", "EAN5", "EAN2", "UPC", "CODE39", "ITF14", "MSI", "pharmacode", "codabar"] as const;
export type BarcodeFormat = (typeof BARCODE_FORMATS)[number];

export const ROLLUP_FNS = ["count", "countValues", "countDistinct", "sum", "sumDistinct", "min", "max", "avg", "avgDistinct", "concat"] as const;
export type RollupFn = (typeof ROLLUP_FNS)[number];

export const TEXT_TRANSFORMS = ["none", "lower", "upper", "title"] as const;
export type TextTransform = (typeof TEXT_TRANSFORMS)[number];

export const NUMBER_FORMATS = ["plain", "currency", "percent"] as const;
export type NumberFormat = (typeof NUMBER_FORMATS)[number];

export interface Choice {
  name: string;
  color?: string;
}

/** What a field can be told; which keys count depends on its type (docs/anagrafiche.md, §4). */
export interface FieldOptions {
  // text, longtext
  maxLength?: number;
  transform?: TextTransform;
  rich?: boolean;
  // phone
  defaultPrefix?: string;
  // number
  precision?: number;
  min?: number;
  max?: number;
  format?: NumberFormat;
  symbol?: string;
  // select, multiselect
  choices?: Choice[];
  // link
  tableId?: number;
  multiple?: boolean;
  inverseId?: number;
  /** link: the records offered when choosing are the ones of this view of the linked table (NocoDB's "limit record selection"). */
  limitViewId?: number;
  // lookup, rollup (fieldId: the field of the linked records); qrcode, barcode (fieldId: the field of this table it shows)
  linkFieldId?: number;
  fieldId?: number;
  barcodeFormat?: BarcodeFormat;
  fn?: RollupFn;
  // formula: references are kept as {#<field id>}, so renaming a field does not break it
  expression?: string;
  // attachment
  accept?: string[];
  maxSizeMb?: number;
  maxFiles?: number;
  // button: it calls a webhook, or opens the address its formula gives (stored as {#id}, like a formula)
  label?: string;
  webhookId?: number;
  url?: string;
  // duration
  durationFormat?: DurationFormat;
  // user: one person of the ERP, or more
  // (multiple is shared with link)
  /**
   * The value of a new record when none is given (not when it is emptied on purpose): fixed, or "today" (date,
   * date and time), "now" (date and time), "@me" (a user field, or the email of a text or email field).
   */
  default?: unknown;
}

export interface Field {
  id: number;
  tableId: number;
  name: string;
  type: FieldType;
  options: FieldOptions;
  required: boolean;
  unique: boolean;
  description: string;
  position: number;
}

export const ACCESS_LEVELS = ["read", "edit", "manage"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

/** Who a rule is for: everybody who signs in, the people of a group, or the records tied to the person looking. */
export type AccessWho = { kind: "everyone" } | { kind: "group"; groupId: number } | { kind: "self"; linkFieldId?: number };

/** One rule of a table: who, how far, and which fields it keeps out of sight or out of reach (§7). */
export interface AccessRule {
  who: AccessWho;
  level: AccessLevel;
  hidden?: number[];
  readOnly?: number[];
}

export interface Table {
  id: number;
  name: string;
  description: string;
  icon: string;
  section: string;
  position: number;
  /** The field that names a record in links and lists; without it, "#<id>". */
  primaryFieldId: number | null;
  access: AccessRule[];
}

export interface RecordRow {
  id: number;
  tableId: number;
  /** The stored values, by field id. */
  data: Record<string, unknown>;
  version: number;
  createdAt: string;
  createdBy: number | null;
  updatedAt: string;
  updatedBy: number | null;
}

/** A link between two records, kept once, on the side of the field that made it. */
export interface Link {
  fieldId: number;
  recordId: number;
  targetId: number;
  position: number;
}

/** What is known of an attached file without reading it. */
export interface FileMeta {
  id: number;
  recordId: number | null;
  fieldId: number | null;
  name: string;
  mime: string;
  size: number;
}

export const CONDITION_OPS = [
  "empty", "notEmpty", "eq", "neq", "contains", "notContains", "startsWith", "endsWith",
  "lt", "lte", "gt", "gte", "anyOf", "allOf", "noneOf", "notAllOf", "checked", "notChecked", "within",
] as const;

/**
 * The periods of `within` (NocoDB's isWithin), as the value of the condition: a name, or [name, number] for
 * the ones with a number of days, or ["dateRange", from, to].
 */
export const WITHIN_PERIODS = [
  "pastWeek", "pastMonth", "pastYear", "nextWeek", "nextMonth", "nextYear", "pastNumberOfDays", "nextNumberOfDays",
  "thisCalendarWeek", "thisCalendarMonth", "thisCalendarYear", "lastCalendarWeek", "lastCalendarMonth", "lastCalendarYear",
  "nextCalendarWeek", "nextCalendarMonth", "nextCalendarYear", "dateRange",
] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number];

export interface Condition {
  field: number;
  op: ConditionOp;
  value?: unknown;
}

/** Conditions joined by AND or OR, groups inside groups; `not` turns the result of the group around. */
export interface Filter {
  join: "and" | "or";
  items: (Condition | Filter)[];
  not?: boolean;
}

export const isFilter = (item: Condition | Filter): item is Filter => "items" in item;

export interface Sort {
  field: number;
  dir: "asc" | "desc";
}

export const VIEW_TYPES = ["grid", "form", "gallery", "kanban", "calendar", "timeline", "map"] as const;
export type ViewType = (typeof VIEW_TYPES)[number];

/** How a form finds the record it changes: the person's own, the one of a signed personal link, one picked from a view. */
export const FORM_TARGETS = ["me", "link", "pick"] as const;
export type FormTarget = (typeof FORM_TARGETS)[number];

export type FormAccess = { kind: "public" } | { kind: "members" } | { kind: "group"; groupId: number };

/** Checks of one answer of a form, on top of the ones of its field (NocoDB's form validations). */
export interface FormValidation {
  minLength?: number;
  maxLength?: number;
  /** A regular expression the answer must match. */
  pattern?: string;
  /** Numbers, or days (YYYY-MM-DD or "today"). */
  min?: number | string;
  max?: number | string;
  /** What to say when a check fails; otherwise a sentence of ours. */
  message?: string;
}

export interface FormField {
  fieldId: number;
  label?: string;
  help?: string;
  required?: boolean;
  /** Shown (and kept) only when the answers so far match. */
  showIf?: Filter;
  validate?: FormValidation;
}

/** A value the form writes by itself on submit: fixed, or "today", "now", "@me"; only when `when` matches, if given. */
export interface FormSet {
  fieldId: number;
  value: unknown;
  when?: Filter;
}

export interface FormConfig {
  access: FormAccess;
  mode: "create" | "update";
  target?: FormTarget;
  /** `pick`: the records the person may choose from. */
  pickViewId?: number;
  title?: string;
  description?: string;
  fields: FormField[];
  set?: FormSet[];
  submitLabel?: string;
  successMessage?: string;
  redirectUrl?: string;
  /** Open from / until (YYYY-MM-DD, both included). */
  opensOn?: string;
  closesOn?: string;
  /** Values may be given in the address (`?Field=value`): editable (true), hidden, or shown read-only. */
  prefill?: boolean | "hide" | "lock";
  /** After sending: a button to fill it in again, or a blank form after five seconds. */
  submitAnother?: boolean;
  blankAfter?: boolean;
  /** One question at a time. */
  survey?: boolean;
}

/** A colour for the records that match (the first rule that matches wins). */
export interface ColorRule {
  filter: Filter;
  color: string;
}

export interface ViewConfig {
  filter?: Filter;
  sorts?: Sort[];
  hidden?: number[];
  order?: number[];
  widths?: Record<string, number>;
  /** One field, or up to five levels (the first is the outer one). */
  groupBy?: number | number[];
  /** Grid: how tall the rows are, and how many columns stay still on the left. */
  rowHeight?: "short" | "medium" | "tall" | "extra";
  frozen?: number;
  /** The colour of each record: the one of its choice in a Choice field, or the first rule it matches. */
  colorBy?: number;
  colors?: ColorRule[];
  /** Nobody changes the view (filters, fields, columns) until somebody who manages the table unlocks it. */
  locked?: boolean;
  description?: string;
  /** Gallery: the attachment shown as the picture of a card. */
  coverField?: number;
  /** Calendar and timeline: the date a record is on (or starts on). */
  dateField?: number;
  /** Timeline: the date a record ends on (none: it is one day). */
  endDateField?: number;
  /** On the table of the people: membership of this view is a group (§7.2). */
  group?: boolean;
  /** A read-only address anybody can open, with the fields of the view only (§10.2). */
  shared?: boolean;
  /** The shared view asks for a password (kept as a salted hash, `scrypt:<salt>:<hash>`). */
  sharedPassword?: string;
  /** The shared view lets people download its records (CSV). */
  sharedDownload?: boolean;
  /** Timeline: a link of the table to itself, whose records come after (the arrows of a gantt). */
  dependencyField?: number;
  /** Map: the coordinates (a geodata field) that place each record. */
  geoField?: number;
  /** The folder the view is listed in, among the views of its table. */
  folder?: string;
  form?: FormConfig;
}

export interface View {
  id: number;
  tableId: number;
  name: string;
  type: ViewType;
  position: number;
  slug: string | null;
  config: ViewConfig;
}

/** Who wrote something, for the "creator" and "modifier" fields. */
export interface UserRef {
  id: number;
  name: string;
  email: string;
}

/** Which table holds the people and which field their sign-in email (§7.2). */
export interface RegistrySettings {
  peopleTableId: number | null;
  emailFieldId: number | null;
}

/** Everything the engine needs, loaded by the API: no database, no clock. */
export interface RegistrySnapshot {
  tables: Table[];
  fields: Field[];
  views: View[];
  records: RecordRow[];
  links: Link[];
  files: FileMeta[];
  users: UserRef[];
  settings: RegistrySettings;
  /** The server's day (YYYY-MM-DD) and moment (ISO), for TODAY(), NOW() and "today" in filters. */
  today: string;
  now: string;
}
