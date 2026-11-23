import { BARCODE_FORMATS, DURATION_FORMATS, fromText, normalizeValue, textOf, type DurationFormat, type FieldType, type FieldOptions, type RollupFn } from "@erp/registry";
import { db } from "../../db/client";
import { appUser, regFile } from "../../db/schema";
import { getCurrentUser, requireAdmin } from "../auth/auth.service";
import { createRecords, updateRecords } from "./records.service";
import { createField, createTable, deleteField, getTable, listTables, updateField, updateTable } from "./schema.service";
import { registryWrite, saveRecords } from "./registry.write";

// Bringing a NocoDB base into the registry (docs/anagrafiche.md, §13bis): its tables, fields (also links,
// lookups, rollups and formulas), records, links and attachments, read with NocoDB's API v3 and a token of
// NocoDB. NocoDB is only read. Without `apply` it only says what it would do.

interface NocoField {
  id: string;
  title: string;
  type: string;
  description?: string | null;
  options?: Record<string, unknown>;
  default_value?: unknown;
}

interface NocoTable {
  id: string;
  title: string;
  base_id: string;
  display_field_id?: string;
  fields: NocoField[];
}

interface NocoRecord {
  id: number | string;
  fields: Record<string, unknown>;
}

export interface NocoImportOptions {
  /** The address of NocoDB, e.g. https://nocodb.example.org */
  url: string;
  /** A token of NocoDB (Account settings › Tokens); sent as xc-token. */
  token: string;
  /** The bases to bring (ids starting with p). */
  baseIds: string[];
  /** Without it nothing is written: the plan comes back. */
  apply: boolean;
  /** The section of the menu the tables go in (the name of their base by default). */
  section?: string;
  /** Tells what happens, a line at a time. */
  log?: (line: string) => void;
  /** Reads a URL of NocoDB (tests give a fake one). */
  fetcher?: typeof fetch;
}

export interface NocoImportReport {
  tables: { name: string; fields: number; records: number }[];
  /** What could not come over as it was, and what was done instead. */
  warnings: string[];
  applied: boolean;
}

/** NocoDB's type → the registry's; null: not brought over. */
const SIMPLE: Record<string, FieldType> = {
  SingleLineText: "text", LongText: "longtext", RichText: "longtext", Email: "email", URL: "url", PhoneNumber: "phone",
  Number: "number", Decimal: "number", Currency: "number", Percent: "number", Rating: "rating", Checkbox: "checkbox", Year: "number",
  Date: "date", DateTime: "datetime", Time: "time", Duration: "duration", SingleSelect: "select", MultiSelect: "multiselect", JSON: "json",
  Attachment: "attachment", GeoData: "geodata", Color: "color", Colour: "color", User: "user", Collaborator: "user",
  // these have no type of their own here: their value comes over as text (a UUID keeps its values this way)
  SpecificDBType: "text", Geometry: "text", UUID: "text",
};
const SYSTEM = ["ID", "CreatedTime", "LastModifiedTime", "CreatedBy", "LastModifiedBy", "Order", "ForeignKey", "Meta", "Deleted", "AutoNumber"];
/** They show another field as a picture: they come over once that field is here. */
const PICTURES = ["Barcode", "QrCode"];
const WORKED_OUT = ["Formula", "Lookup", "Rollup", "Button", ...PICTURES];
const LINKS = ["LinkToAnotherRecord", "Links"];

// NocoDB's count is SQL's: the linked values that are there; countAll is every linked record
const ROLLUP: Record<string, RollupFn> = {
  count: "countValues", countAll: "count", countDistinct: "countDistinct", sum: "sum", sumDistinct: "sumDistinct", avg: "avg", avgDistinct: "avgDistinct", min: "min", max: "max",
};

/** The side of a link: does this record hold many, and does the other side hold many. */
function sides(relation: unknown): { multiple: boolean; inverseMultiple: boolean } {
  switch (relation) {
    case "mo": return { multiple: false, inverseMultiple: true };
    case "om": case "hm": return { multiple: true, inverseMultiple: false };
    case "oo": return { multiple: false, inverseMultiple: false };
    default: return { multiple: true, inverseMultiple: true };
  }
}

const complement = (relation: unknown) => (relation === "mo" ? "om" : relation === "om" || relation === "hm" ? "mo" : relation);

function optionsOf(field: NocoField): FieldOptions {
  const o = field.options ?? {};
  switch (field.type) {
    case "Decimal": return { precision: Number(o.precision ?? 2) };
    case "Currency": return { precision: 2, format: "currency", symbol: o.currency_code === "EUR" || !o.currency_code ? "€" : String(o.currency_code) };
    case "Percent": return { precision: Number(o.precision ?? 0), format: "percent" };
    // NocoDB keeps the number of stars in max_value
    case "Rating": return { max: Math.min(10, Number(o.max_value ?? o.max ?? 5)) };
    case "LongText": return o.rich_text === true ? { rich: true } : {};
    case "SingleSelect": case "MultiSelect": return { choices: ((o.choices as { title: string; color?: string }[] | undefined) ?? []).map((c) => ({ name: c.title, ...(c.color ? { color: c.color } : {}) })) };
    case "RichText": return { rich: true };
    case "Year": return { precision: 0, min: 1000, max: 9999 };
    case "Duration": {
      const format = String(o.duration_format ?? o.format ?? "h:mm").toLowerCase();
      return DURATION_FORMATS.includes(format as DurationFormat) ? { durationFormat: format as DurationFormat } : {};
    }
    case "User": case "Collaborator": return { multiple: o.allow_multiple_users === true || o.is_multi === true };
    default: return {};
  }
}

/** The default of a field of NocoDB, when there is one this registry can keep as it is. */
function defaultOf(field: NocoField): unknown {
  const d = field.default_value ?? field.options?.default_value;
  if (d === undefined || d === null || d === "" || ["User", "Collaborator", "Attachment"].includes(field.type)) return undefined;
  // NocoDB writes the SQL of a default (`'Waiting'`): the quotes go
  return typeof d === "string" ? d.replace(/^'(.*)'$/s, "$1") : d;
}

/** A value of a record of NocoDB as the registry takes it (before normalizeValue); people by their email. */
function valueOf(field: NocoField, raw: unknown, users: Map<string, number> = new Map()): unknown {
  if (raw === null || raw === undefined) return null;
  switch (field.type) {
    case "User":
    case "Collaborator":
      return (Array.isArray(raw) ? raw : [raw]).map((u) => users.get(String((u as { email?: unknown })?.email ?? u).toLowerCase())).filter((id) => id !== undefined);
    case "MultiSelect": return Array.isArray(raw) ? raw : String(raw).split(",").map((s) => s.trim()).filter(Boolean);
    case "Checkbox": return raw === true || raw === 1 || raw === "true";
    case "JSON": return typeof raw === "string" ? fromText("json", raw) : raw;
    case "Number": case "Decimal": case "Currency": case "Percent": case "Rating": return typeof raw === "string" ? Number(raw) : raw;
    default: return typeof raw === "object" ? textOf(raw) : raw;
  }
}

/** The ids of the records a link value of NocoDB points at (an object, a list of objects, or ids). */
function linkedIds(raw: unknown): string[] {
  if (raw === null || raw === undefined) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map((x) => (typeof x === "object" && x !== null && "id" in x ? String((x as { id: unknown }).id) : String(x))).filter((x) => x !== "" && x !== "undefined");
}

export async function importFromNocodb(options: NocoImportOptions): Promise<NocoImportReport> {
  const actor = await getCurrentUser();
  requireAdmin(actor);
  const log = options.log ?? (() => undefined);
  const get = options.fetcher ?? fetch;
  const base = options.url.replace(/\/+$/, "");
  const read = async <T>(pathOrUrl: string): Promise<T> => {
    const response = await get(pathOrUrl.startsWith("http") ? pathOrUrl : `${base}${pathOrUrl}`, { headers: { "xc-token": options.token } });
    if (!response.ok) throw new Error(`NocoDB answered ${response.status} to ${pathOrUrl}`);
    return (await response.json()) as T;
  };
  const warnings: string[] = [];
  const warn = (line: string) => {
    warnings.push(line);
    log(`! ${line}`);
  };

  // 1. the description and the records of every table, from NocoDB
  const tables: (NocoTable & { section: string; records: NocoRecord[] })[] = [];
  for (const baseId of options.baseIds) {
    const list = await read<{ list: { id: string; title: string }[] }>(`/api/v3/meta/bases/${baseId}/tables`);
    const bases = await read<{ list: { id: string; title: string }[] }>(`/api/v3/meta/bases`).catch(() => ({ list: [] }));
    const section = options.section ?? bases.list.find((b) => b.id === baseId)?.title ?? baseId;
    for (const item of list.list) {
      const table = await read<NocoTable>(`/api/v3/meta/bases/${baseId}/tables/${item.id}`);
      const records: NocoRecord[] = [];
      let next: string | null = `/api/v3/data/${baseId}/${item.id}/records?pageSize=100`;
      while (next) {
        const page: { records?: NocoRecord[]; next?: string | null } = await read(next);
        records.push(...(page.records ?? []));
        next = page.next ?? null;
      }
      tables.push({ ...table, base_id: baseId, section, records });
      log(`${table.title}: ${table.fields.length} fields, ${records.length} records`);
    }
  }
  const byNocoTable = new Map(tables.map((t) => [t.id, t]));

  // 2. the links in pairs: NocoDB lists both sides without saying which goes with which; the one whose links
  //    are the same rows read the other way is the other side
  const pairs = new Map<string, string | null>();
  for (const t of tables) {
    for (const f of t.fields.filter((x) => LINKS.includes(x.type))) {
      if (pairs.has(f.id)) continue;
      const target = byNocoTable.get(String(f.options?.related_table_id));
      if (!target) {
        warn(`${t.title} › ${f.title} links to a table that is not brought over: left out`);
        pairs.set(f.id, null);
        continue;
      }
      const forward = new Set(t.records.flatMap((r) => linkedIds(r.fields[f.title]).map((other) => `${r.id}>${other}`)));
      const candidates = target.fields.filter((g) => LINKS.includes(g.type) && g.id !== f.id && !pairs.has(g.id) && String(g.options?.related_table_id) === t.id && g.options?.relation_type === complement(f.options?.relation_type));
      const score = (g: NocoField) => target.records.flatMap((r) => linkedIds(r.fields[g.title]).map((other) => `${other}>${r.id}`)).filter((k) => forward.has(k)).length;
      const best = candidates.map((g) => ({ g, s: score(g) })).sort((a, b) => b.s - a.s)[0];
      pairs.set(f.id, best ? best.g.id : null);
      if (best) pairs.set(best.g.id, f.id);
    }
  }

  const report: NocoImportReport = { tables: tables.map((t) => ({ name: t.title, fields: t.fields.length, records: t.records.length })), warnings, applied: false };
  for (const t of tables) {
    for (const f of t.fields) {
      if (SYSTEM.includes(f.type)) continue;
      if (!SIMPLE[f.type] && !LINKS.includes(f.type) && !WORKED_OUT.includes(f.type)) warn(`${t.title} › ${f.title}: type ${f.type} is not known here: left out`);
      else if (SIMPLE[f.type] === "text" && f.type !== "SingleLineText") warn(`${t.title} › ${f.title}: ${f.type} comes over as text`);
    }
  }
  // a table of the same name is never overwritten: rename or delete it first
  const existing = await listTables();
  for (const t of tables) if (existing.some((e) => e.name.toLowerCase() === t.title.toLowerCase())) warn(`There is already a table called ${t.title}: nothing can be brought over until it is renamed or deleted`);
  if (!options.apply || warnings.some((w) => w.startsWith("There is already a table"))) return report;

  // 3. the tables (a "Name" field comes with each: it is reused if NocoDB has one, deleted otherwise)
  const ourTable = new Map<string, number>();
  const ourField = new Map<string, number>();
  for (const t of tables) {
    const made = await createTable({ name: t.title, section: t.section, description: "Imported from NocoDB" });
    ourTable.set(t.id, made.id);
    const name = t.fields.find((f) => f.title.toLowerCase() === "name" && f.type === "SingleLineText");
    if (name) ourField.set(name.id, made.fields[0]!.id);
  }

  // 4. the stored fields
  for (const t of tables) {
    for (const f of t.fields) {
      const type = SIMPLE[f.type];
      if (!type || ourField.has(f.id)) continue;
      const field = { name: f.title, type, options: optionsOf(f), description: f.description ?? undefined };
      const fallback = defaultOf(f);
      try {
        const made = await createField(ourTable.get(t.id)!, fallback === undefined ? field : { ...field, options: { ...field.options, default: fallback } }).catch(async (error: Error) => {
          // a default this registry cannot keep: the field comes without it
          if (fallback === undefined) throw error;
          warn(`${t.title} › ${f.title}: default value left out (${error.message})`);
          return createField(ourTable.get(t.id)!, field);
        });
        ourField.set(f.id, made.id);
      } catch (error) {
        warn(`${t.title} › ${f.title}: ${(error as Error).message}`);
      }
    }
  }

  // 5. the links, one field per pair (its other side is made with it)
  for (const t of tables) {
    for (const f of t.fields.filter((x) => LINKS.includes(x.type))) {
      if (ourField.has(f.id) || !pairs.has(f.id) || !byNocoTable.has(String(f.options?.related_table_id))) continue;
      const other = pairs.get(f.id);
      const target = byNocoTable.get(String(f.options?.related_table_id))!;
      const inverse = other ? target.fields.find((g) => g.id === other) : undefined;
      const { multiple, inverseMultiple } = sides(f.options?.relation_type);
      try {
        const made = await createField(ourTable.get(t.id)!, {
          name: f.title, type: "link", options: { tableId: ourTable.get(target.id)!, multiple }, inverseName: inverse?.title ?? `${f.title} (from ${t.title})`, inverseMultiple,
        });
        ourField.set(f.id, made.id);
        if (inverse) {
          const table = await getTable(ourTable.get(target.id)!);
          const field = table.fields.find((x) => x.options.inverseId === made.id);
          if (field) ourField.set(inverse.id, field.id);
        }
      } catch (error) {
        warn(`${t.title} › ${f.title}: ${(error as Error).message}`);
      }
    }
  }

  // 6. lookups, rollups and formulas: each needs what it reads, so they are made in rounds until nothing more can be
  const pending = tables.flatMap((t) => t.fields.filter((f) => WORKED_OUT.includes(f.type)).map((f) => ({ t, f })));
  for (let progress = true; progress && pending.length > 0; ) {
    progress = false;
    for (const item of [...pending]) {
      const { t, f } = item;
      const o = f.options ?? {};
      let body: Parameters<typeof createField>[1] | null = null;
      if (f.type === "Formula") body = { name: f.title, type: "formula", options: { expression: String(o.formula ?? "") } };
      // a button that opens an address keeps its formula; one that calls a webhook of NocoDB waits for a webhook here
      if (f.type === "Button") body = { name: f.title, type: "button", options: { label: String(o.label ?? f.title), ...(o.type === "url" && o.formula ? { url: String(o.formula) } : {}) } };
      if (PICTURES.includes(f.type)) {
        // the field it draws (NocoDB's names for it changed between versions)
        const source = ourField.get(String(o.fk_qr_value_column_id ?? o.fk_barcode_value_column_id ?? o.qrcode_value_field_id ?? o.barcode_value_field_id ?? o.field_id));
        if (source === undefined) continue;
        const format = BARCODE_FORMATS.find((x) => x.toLowerCase() === String(o.barcode_format ?? o.format ?? "").toLowerCase());
        body = { name: f.title, type: f.type === "QrCode" ? "qrcode" : "barcode", options: { fieldId: source, ...(format ? { barcodeFormat: format } : {}) } };
      }
      if (f.type === "Lookup" || f.type === "Rollup") {
        const link = ourField.get(String(o.related_field_id));
        const read = ourField.get(String(o.related_table_lookup_field_id ?? o.related_table_rollup_field_id));
        if (link === undefined || (read === undefined && f.type === "Lookup")) continue;
        body = f.type === "Lookup"
          ? { name: f.title, type: "lookup", options: { linkFieldId: link, fieldId: read } }
          : { name: f.title, type: "rollup", options: { linkFieldId: link, ...(read !== undefined ? { fieldId: read } : {}), fn: read === undefined ? "count" : (ROLLUP[String(o.rollup_function)] ?? "count") } };
      }
      if (!body) continue;
      try {
        const made = await createField(ourTable.get(t.id)!, body);
        ourField.set(f.id, made.id);
        pending.splice(pending.indexOf(item), 1);
        progress = true;
      } catch {
        // what it reads may come in a later round
      }
    }
  }
  for (const { t, f } of pending) warn(`${t.title} › ${f.title}: the ${f.type.toLowerCase()} could not be made (it uses something not brought over, or a function not known here)`);

  // 7. the name of the records, and the "Name" field nobody asked for
  for (const t of tables) {
    const table = await getTable(ourTable.get(t.id)!);
    const display = t.display_field_id ? ourField.get(t.display_field_id) : undefined;
    if (display !== undefined && display !== table.primaryFieldId) await updateTable(table.id, { primaryFieldId: display });
    const auto = table.fields[0]!;
    if (![...ourField.values()].includes(auto.id)) {
      if (display === undefined) await updateField(auto.id, { name: "Name (empty)" }).catch(() => undefined);
      else await deleteField(auto.id).catch(() => undefined);
    }
  }

  // 8. the records with their stored values; then their links; then their files
  const ourRecord = new Map<string, number>();
  const users = new Map((await db.select({ id: appUser.id, email: appUser.email }).from(appUser)).map((u) => [u.email.toLowerCase(), u.id]));
  for (const t of tables) {
    const tableId = ourTable.get(t.id)!;
    const stored = t.fields.filter((f) => SIMPLE[f.type] && SIMPLE[f.type] !== "attachment" && ourField.has(f.id));
    const table = await getTable(tableId);
    const fieldById = new Map(table.fields.map((f) => [f.id, f]));
    const inputs = t.records.map((r) => {
      const fields: Record<string, unknown> = {};
      for (const f of stored) {
        const ours = fieldById.get(ourField.get(f.id)!)!;
        const value = valueOf(f, r.fields[f.title], users);
        const checked = normalizeValue({ ...ours, tableId, unique: ours.unique }, value);
        if (checked.ok) fields[String(ours.id)] = checked.value;
        else if (value !== null) warn(`${t.title} #${r.id} › ${f.title}: ${checked.error}: left empty`);
      }
      return { fields };
    });
    for (let i = 0; i < inputs.length; i += 500) {
      const made = await createRecords(tableId, inputs.slice(i, i + 500));
      made.forEach((m, k) => ourRecord.set(`${t.id}:${t.records[i + k]!.id}`, m.id));
    }
    log(`${t.title}: ${inputs.length} records brought over`);
  }
  for (const t of tables) {
    // one side of each pair is enough: the other reads the same links
    const owners = t.fields.filter((f) => LINKS.includes(f.type) && ourField.has(f.id) && isOwner(f, pairs, tables));
    for (const f of owners) {
      const targetTable = String(f.options?.related_table_id);
      const changes = t.records
        .map((r) => ({ id: ourRecord.get(`${t.id}:${r.id}`)!, ids: linkedIds(r.fields[f.title]).map((other) => ourRecord.get(`${targetTable}:${other}`)).filter((x): x is number => x !== undefined) }))
        .filter((c) => c.ids.length > 0)
        .map((c) => ({ id: c.id, fields: { [String(ourField.get(f.id)!)]: sides(f.options?.relation_type).multiple ? c.ids : c.ids.slice(0, 1) } }));
      for (let i = 0; i < changes.length; i += 500) await updateRecords(ourTable.get(t.id)!, changes.slice(i, i + 500));
    }
  }
  for (const t of tables) {
    for (const f of t.fields.filter((x) => x.type === "Attachment" && ourField.has(x.id))) {
      const fieldId = ourField.get(f.id)!;
      for (const r of t.records) {
        const files = (Array.isArray(r.fields[f.title]) ? r.fields[f.title] : []) as { url?: string; signedUrl?: string; path?: string; title?: string; mimetype?: string }[];
        if (files.length === 0) continue;
        const recordId = ourRecord.get(`${t.id}:${r.id}`)!;
        const ids: number[] = [];
        for (const file of files) {
          const address = file.signedUrl ?? file.url ?? (file.path ? `${base}/${file.path.replace(/^\/+/, "")}` : null);
          if (!address) continue;
          try {
            const response = await get(address.startsWith("http") ? address : `${base}/${address.replace(/^\/+/, "")}`, { headers: { "xc-token": options.token } });
            if (!response.ok) throw new Error(`answered ${response.status}`);
            const bytes = Buffer.from(await response.arrayBuffer());
            const [row] = await db.insert(regFile).values({ recordId, fieldId, name: file.title ?? "file", mime: file.mimetype ?? "application/octet-stream", sizeBytes: bytes.length, data: bytes, uploadedBy: actor.id }).returning({ id: regFile.id });
            ids.push(row!.id);
          } catch (error) {
            warn(`${t.title} #${r.id} › ${f.title}: ${file.title ?? "a file"} could not be read (${(error as Error).message})`);
          }
        }
        if (ids.length > 0) await registryWrite(actor, "import", (w) => saveRecords(w, ourTable.get(t.id)!, [{ id: recordId, values: new Map([[fieldId, ids]]) }]));
      }
    }
  }
  report.applied = true;
  return report;
}

/** The side of a pair whose links are written: the field met first (the other side reads them). */
function isOwner(field: NocoField, pairs: Map<string, string | null>, tables: NocoTable[]): boolean {
  const other = pairs.get(field.id);
  if (!other) return true;
  const order = tables.flatMap((t) => t.fields.map((f) => f.id));
  return order.indexOf(field.id) < order.indexOf(other);
}
