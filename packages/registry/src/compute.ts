import { evaluateFormula, parseFormula, type FormulaNode, type FormulaValue } from "./formula";
import type { Field, FileMeta, Link, RecordRow, RegistrySnapshot, Table, View } from "./types";
import { textOf } from "./values";

// The worked-out registry: every value of every record, stored or computed (links, lookups, rollups,
// formulas, who and when), worked out once and only when asked. One per request, built from a snapshot.

/** A linked record as the API shows it. */
export interface LinkedRef {
  id: number;
  name: string;
}

/** An attached file as the API shows it. */
export interface FileRef {
  id: number;
  name: string;
  mime: string;
  size: number;
}

export interface Registry {
  readonly snapshot: RegistrySnapshot;
  table(id: number): Table | undefined;
  /** By id, or by name without regard to case. */
  findTable(idOrName: string | number): Table | undefined;
  /** The fields of a table, in their order. */
  fieldsOf(tableId: number): Field[];
  field(id: number): Field | undefined;
  /** By id, or by name without regard to case. */
  findField(tableId: number, idOrName: string | number): Field | undefined;
  viewsOf(tableId: number): View[];
  view(id: number): View | undefined;
  record(id: number): RecordRow | undefined;
  recordsOf(tableId: number): RecordRow[];
  /** The ids of the records a link field of `record` points at, in order. */
  linkedIds(record: RecordRow, field: Field): number[];
  /** The value used by formulas, filters and sorting: links and files as their names, everything else as kept. */
  value(record: RecordRow, field: Field): FormulaValue | unknown;
  /** The value as the API sends it: links as {id, name}, files as {id, name, mime, size}. */
  output(record: RecordRow, field: Field): unknown;
  /** The name of a record: the value of the primary field of its table, or "#<id>". */
  display(recordId: number): string;
  file(id: number): FileMeta | undefined;
}

/** The field that keeps the rows of a pair of link fields: the one made first. */
export function ownerOf(field: Field): number {
  const inverse = field.options.inverseId;
  return inverse !== undefined && inverse < field.id ? inverse : field.id;
}

export function openRegistry(snapshot: RegistrySnapshot): Registry {
  const tables = new Map(snapshot.tables.map((t) => [t.id, t]));
  const fields = new Map(snapshot.fields.map((f) => [f.id, f]));
  const views = new Map(snapshot.views.map((v) => [v.id, v]));
  const records = new Map(snapshot.records.map((r) => [r.id, r]));
  const files = new Map(snapshot.files.map((f) => [f.id, f]));
  const users = new Map(snapshot.users.map((u) => [u.id, u]));

  const byTable = <T extends { tableId: number }>(items: T[], order: (a: T, b: T) => number) => {
    const out = new Map<number, T[]>();
    for (const item of items) out.set(item.tableId, [...(out.get(item.tableId) ?? []), item]);
    for (const list of out.values()) list.sort(order);
    return out;
  };
  const tableFields = byTable(snapshot.fields, (a, b) => a.position - b.position || a.id - b.id);
  const tableViews = byTable(snapshot.views, (a, b) => a.position - b.position || a.id - b.id);
  const tableRecords = byTable(snapshot.records, (a, b) => a.id - b.id);

  // links by the owning field, both ways
  const forward = new Map<number, Map<number, Link[]>>();
  const backward = new Map<number, Map<number, Link[]>>();
  const index = (map: Map<number, Map<number, Link[]>>, fieldId: number, key: number, link: Link) => {
    const perField = map.get(fieldId) ?? new Map<number, Link[]>();
    perField.set(key, [...(perField.get(key) ?? []), link]);
    map.set(fieldId, perField);
  };
  for (const link of snapshot.links) {
    index(forward, link.fieldId, link.recordId, link);
    index(backward, link.fieldId, link.targetId, link);
  }

  // the formulas read once: of a formula field, or the address of a button
  const formulas = new Map<number, FormulaNode | null>();
  const formulaOf = (field: Field) => {
    if (!formulas.has(field.id)) {
      try {
        formulas.set(field.id, parseFormula((field.type === "button" ? field.options.url : field.options.expression) ?? ""));
      } catch {
        formulas.set(field.id, null);
      }
    }
    return formulas.get(field.id) ?? null;
  };

  const values = new WeakMap<RecordRow, Map<number, unknown>>();
  const busy = new Set<string>();
  const displays = new Map<number, string>();
  const env = { today: snapshot.today, now: snapshot.now };

  function linkedIds(record: RecordRow, field: Field): number[] {
    const owner = ownerOf(field);
    if (owner === field.id) {
      return [...(forward.get(owner)?.get(record.id) ?? [])].sort((a, b) => a.position - b.position || a.targetId - b.targetId).map((l) => l.targetId);
    }
    return (backward.get(owner)?.get(record.id) ?? []).map((l) => l.recordId).sort((a, b) => a - b);
  }

  const flat = (list: unknown[]): unknown[] => list.flatMap((v) => (Array.isArray(v) ? flat(v) : [v]));

  /** The linked records of a lookup or rollup, with the field to read in them. */
  function through(record: RecordRow, field: Field): { targets: RecordRow[]; target: Field | undefined } {
    const link = fields.get(field.options.linkFieldId ?? 0);
    const target = fields.get(field.options.fieldId ?? 0);
    if (!link || link.type !== "link") return { targets: [], target: undefined };
    const targets = linkedIds(record, link).map((id) => records.get(id)).filter((r): r is RecordRow => r !== undefined);
    return { targets, target };
  }

  function compute(record: RecordRow, field: Field): unknown {
    const stored = record.data[String(field.id)];
    switch (field.type) {
      case "checkbox":
        return stored === true;
      case "link":
        return linkedIds(record, field).map(display);
      case "attachment":
        return (Array.isArray(stored) ? stored : []).map((id) => files.get(Number(id))?.name ?? `#${id}`);
      case "lookup": {
        const { targets, target } = through(record, field);
        return target ? flat(targets.map((t) => value(t, target))).filter((v) => v !== null && v !== "") : [];
      }
      case "rollup": {
        const { targets, target } = through(record, field);
        const list = target ? flat(targets.map((t) => value(t, target))).filter((v) => v !== null && v !== "" && v !== false) : [];
        const fn = field.options.fn ?? "count";
        const distinct = [...new Set(list.map((v) => (typeof v === "string" ? v.toLowerCase() : v)))];
        const nums = (fn.endsWith("Distinct") ? distinct : list).map(Number).filter((n) => Number.isFinite(n));
        const round = (n: number) => Math.round(n * 1e10) / 1e10;
        // the smallest and largest of dates are dates
        const dates = list.every((v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) ? (list as string[]).sort() : null;
        switch (fn) {
          case "count": return targets.length;
          case "countValues": return list.length;
          case "countDistinct": return distinct.length;
          case "sum":
          case "sumDistinct": return round(nums.reduce((s, n) => s + n, 0));
          case "min": return dates?.length ? dates[0]! : nums.length ? Math.min(...nums) : null;
          case "max": return dates?.length ? dates[dates.length - 1]! : nums.length ? Math.max(...nums) : null;
          case "avg":
          case "avgDistinct": return nums.length ? round(nums.reduce((s, n) => s + n, 0) / nums.length) : null;
          case "concat": return list.map(textOf).join(", ");
        }
        return null;
      }
      case "formula":
      case "button": {
        // a button has a value only when it opens an address: the one its formula makes
        if (field.type === "button" && !field.options.url) return null;
        const node = formulaOf(field);
        if (!node) return null;
        const resolve = (ref: string): FormulaValue => {
          const refField = ref.startsWith("#") ? fields.get(Number(ref.slice(1))) : undefined;
          if (!refField || refField.tableId !== field.tableId) return null;
          const v = value(record, refField);
          return (v === undefined ? null : typeof v === "object" && v !== null && !Array.isArray(v) ? JSON.stringify(v) : v) as FormulaValue;
        };
        return evaluateFormula(node, resolve, { ...env, recordId: record.id, createdAt: record.createdAt });
      }
      case "user":
        return (Array.isArray(stored) ? stored : []).map((id) => users.get(Number(id))?.name ?? `#${id}`);
      case "json":
        return stored === undefined ? null : stored;
      case "qrcode":
      case "barcode": {
        // the text of another field of the record, drawn as a code by the site
        const source = fields.get(field.options.fieldId ?? 0);
        if (!source || source.tableId !== field.tableId || source.id === field.id) return null;
        const text = textOf(value(record, source)).trim();
        return text === "" ? null : text;
      }
      case "autonumber":
        return record.id;
      case "created":
        return record.createdAt;
      case "modified":
        return record.updatedAt;
      case "creator":
        return record.createdBy === null ? null : (users.get(record.createdBy)?.name ?? null);
      case "modifier":
        return record.updatedBy === null ? null : (users.get(record.updatedBy)?.name ?? null);
      case "multiselect":
        return Array.isArray(stored) ? stored : [];
      default:
        return stored === undefined ? null : stored;
    }
  }

  function value(record: RecordRow, field: Field): unknown {
    let perRecord = values.get(record);
    if (!perRecord) {
      perRecord = new Map();
      values.set(record, perRecord);
    }
    if (perRecord.has(field.id)) return perRecord.get(field.id);
    const key = `${record.id}:${field.id}`;
    // a formula or lookup that comes back to itself: empty, instead of looping
    if (busy.has(key)) return null;
    busy.add(key);
    try {
      const result = compute(record, field);
      perRecord.set(field.id, result);
      return result;
    } finally {
      busy.delete(key);
    }
  }

  function display(recordId: number): string {
    const known = displays.get(recordId);
    if (known !== undefined) return known;
    const record = records.get(recordId);
    const table = record ? tables.get(record.tableId) : undefined;
    const primary = table?.primaryFieldId ? fields.get(table.primaryFieldId) : undefined;
    const key = `display:${recordId}`;
    if (!record || !primary || busy.has(key)) return `#${recordId}`;
    busy.add(key);
    try {
      const text = textOf(value(record, primary)).trim();
      const name = text === "" ? `#${recordId}` : text;
      displays.set(recordId, name);
      return name;
    } finally {
      busy.delete(key);
    }
  }

  function output(record: RecordRow, field: Field): unknown {
    switch (field.type) {
      case "link":
        return linkedIds(record, field).map((id): LinkedRef => ({ id, name: display(id) }));
      case "attachment": {
        const stored = record.data[String(field.id)];
        return (Array.isArray(stored) ? stored : [])
          .map((id) => files.get(Number(id)))
          .filter((f): f is FileMeta => f !== undefined)
          .map((f): FileRef => ({ id: f.id, name: f.name, mime: f.mime, size: f.size }));
      }
      case "lookup": {
        const { targets, target } = through(record, field);
        return target ? flat(targets.map((t) => output(t, target))).filter((v) => v !== null && v !== "") : [];
      }
      case "user": {
        const stored = record.data[String(field.id)];
        return (Array.isArray(stored) ? stored : []).map((id): LinkedRef => ({ id: Number(id), name: users.get(Number(id))?.name ?? `#${id}` }));
      }
      default:
        return value(record, field);
    }
  }

  const findBy = <T extends { id: number; name: string }>(list: T[], idOrName: string | number) => {
    if (typeof idOrName === "number" || /^\d+$/.test(idOrName)) {
      const found = list.find((x) => x.id === Number(idOrName));
      if (found) return found;
    }
    const name = String(idOrName).trim().toLowerCase();
    return list.find((x) => x.name.toLowerCase() === name);
  };

  return {
    snapshot,
    table: (id) => tables.get(id),
    findTable: (idOrName) => findBy(snapshot.tables, idOrName),
    fieldsOf: (tableId) => tableFields.get(tableId) ?? [],
    field: (id) => fields.get(id),
    findField: (tableId, idOrName) => findBy(tableFields.get(tableId) ?? [], idOrName),
    viewsOf: (tableId) => tableViews.get(tableId) ?? [],
    view: (id) => views.get(id),
    record: (id) => records.get(id),
    recordsOf: (tableId) => tableRecords.get(tableId) ?? [],
    linkedIds,
    value,
    output,
    display,
    file: (id) => files.get(id),
  };
}

/**
 * The same snapshot with one record changed or added (a draft: id -1 for a new one) and the links of its
 * link fields replaced. Used to check a change before it is saved: conditions, unique values, webhooks.
 */
export function withDraft(snapshot: RegistrySnapshot, draft: RecordRow, links: Record<number, number[]>): RegistrySnapshot {
  const fieldsById = new Map(snapshot.fields.map((f) => [f.id, f]));
  const changed = Object.keys(links).map(Number);
  const owners = new Set(changed.map((id) => ownerOf(fieldsById.get(id)!)));
  const kept = snapshot.links.filter((l) => {
    if (!owners.has(l.fieldId)) return true;
    // drop the links of the draft for the fields being replaced, on whichever side it is
    for (const id of changed) {
      const field = fieldsById.get(id)!;
      if (ownerOf(field) !== l.fieldId) continue;
      if (field.id === l.fieldId ? l.recordId === draft.id : l.targetId === draft.id) return false;
    }
    return true;
  });
  const added: Link[] = [];
  for (const id of changed) {
    const field = fieldsById.get(id)!;
    const owner = ownerOf(field);
    (links[id] ?? []).forEach((other, position) =>
      added.push(owner === field.id ? { fieldId: owner, recordId: draft.id, targetId: other, position } : { fieldId: owner, recordId: other, targetId: draft.id, position: 0 }),
    );
  }
  return {
    ...snapshot,
    records: [...snapshot.records.filter((r) => r.id !== draft.id), draft],
    links: [...kept, ...added],
  };
}
