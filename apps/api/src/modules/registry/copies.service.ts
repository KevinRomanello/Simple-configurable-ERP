import { randomUUID } from "node:crypto";
import { fieldProblem, formulaRefs, fromText, groupLevels, isStored, normalizeValue, openRegistry, parseCsv, parseFormula, type Field, type FieldOptions, type FieldType, type Registry, type ViewConfig } from "@erp/registry";
import { eq, sql } from "drizzle-orm";
import { conflict, invalid, notFound } from "../../core/errors";
import { db } from "../../db/client";
import { regField, regRecord, regTable, regView } from "../../db/schema/registry";
import { getCurrentUser, requireAdmin } from "../../platform/auth/auth.service";
import { loadRegistry } from "./registry.data";
import { registryWrite, saveRecords } from "./registry.write";
import { fieldOut, getTable, managed, viewOut } from "./schema.service";

// Copies and tables made from a file, as NocoDB's "Duplicate" and "Create table from CSV / Excel"
// (docs/anagrafiche.md, §10.2): a view, a field, a whole table, a table from its rows.

/** A free name: "People copy", "People copy 2"… */
function freeName(base: string, taken: string[]) {
  const used = new Set(taken.map((n) => n.toLowerCase()));
  let name = `${base} copy`;
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} copy ${n}`;
  return name;
}

/** POST /registry/views/:id/duplicate: the same configuration, without an address (a form gets one when it is shared again). */
export async function duplicateView(viewId: number, name?: string) {
  const [row] = await db.select().from(regView).where(eq(regView.id, viewId));
  if (!row) throw notFound("View");
  const { reg, table, actor } = await managed(row.tableId);
  const { sharedPassword: _hash, ...config } = row.config as ViewConfig;
  // the copy is not a group (a group is one view) and not shared until somebody decides it
  const copy: ViewConfig = { ...config, group: undefined, shared: undefined, sharedDownload: undefined, locked: undefined };
  const position = Math.max(0, ...reg.viewsOf(table.id).map((v) => v.position)) + 1;
  const id = await registryWrite(actor, "api", async (w) => {
    const [made] = await w.tx.insert(regView).values({ tableId: table.id, name: name ?? freeName(row.name, reg.viewsOf(table.id).map((v) => v.name)), type: row.type, position, slug: null, config: JSON.parse(JSON.stringify(copy)) }).returning({ id: regView.id });
    w.touched.add(table.id);
    return made!.id;
  });
  const after = openRegistry(await loadRegistry(db, [table.id]));
  return viewOut(after.view(id)!);
}

/** POST /registry/fields/:id/duplicate: the same type and options, and (stored types) the same values. */
export async function duplicateField(fieldId: number, name?: string) {
  const [row] = await db.select().from(regField).where(eq(regField.id, fieldId));
  if (!row) throw notFound("Field");
  const { reg, table, actor } = await managed(row.tableId);
  const field = reg.field(fieldId)!;
  if (field.type === "link") throw invalid("A link is made again with its other side: add a new link instead");
  if (field.type === "uuid") throw invalid("A uuid is one per record: add a new uuid field instead");
  const draft: Field = { ...field, id: -1, name: name ?? freeName(field.name, reg.fieldsOf(table.id).map((f) => f.name)), unique: false, position: field.position };
  const problem = fieldProblem(reg.snapshot, draft);
  if (problem) throw invalid(problem);
  const id = await registryWrite(actor, "api", async (w) => {
    // the copy goes right after the original
    await w.tx.execute(sql`update reg_field set position = position + 1 where table_id = ${table.id} and position > ${field.position}`);
    const [made] = await w.tx
      .insert(regField)
      .values({ tableId: table.id, name: draft.name, type: draft.type, options: draft.options, required: false, uniqueValues: false, description: draft.description, position: field.position + 1 })
      .returning({ id: regField.id });
    if (isStored(field.type)) await w.tx.execute(sql`update reg_record set data = data || jsonb_build_object(${String(made!.id)}::text, data -> ${String(field.id)}) where table_id = ${table.id} and data ? ${String(field.id)}`);
    w.touched.add(table.id);
    return made!.id;
  });
  const after = openRegistry(await loadRegistry(db, [table.id]));
  return fieldOut(after, after.field(id)!);
}

/** The ids of a configuration of a view moved to the copies of the fields (the ones not copied are left out). */
function remapConfig(config: ViewConfig, ids: Map<number, number>): ViewConfig {
  const text = JSON.stringify(config, (key, value) => {
    if (typeof value === "number" && ["field", "fieldId", "coverField", "dateField", "endDateField", "colorBy", "dependencyField"].includes(key)) return ids.get(value) ?? -1;
    return value;
  });
  const out = JSON.parse(text) as ViewConfig & Record<string, unknown>;
  const list = (l?: number[]) => l?.map((id) => ids.get(id)).filter((id): id is number => id !== undefined);
  out.hidden = list(config.hidden);
  out.order = list(config.order);
  const levels = list(groupLevels(config.groupBy)) ?? [];
  out.groupBy = levels.length === 0 ? undefined : levels.length === 1 ? levels[0] : levels;
  out.widths = config.widths ? Object.fromEntries(Object.entries(config.widths).flatMap(([k, v]) => (ids.has(Number(k)) ? [[String(ids.get(Number(k))), v]] : []))) : undefined;
  return out;
}

/** The fields a copy of a table can take: not the links (they belong to a pair) nor what reads them. */
function copiable(reg: Registry, tableId: number): { kept: Field[]; skipped: string[] } {
  const kept: Field[] = [];
  const skipped: string[] = [];
  const keptIds = new Set<number>();
  // a formula can come only after the fields it reads: rounds until nothing more can be taken
  const pending = reg.fieldsOf(tableId).filter((f) => {
    if (["link", "lookup", "rollup"].includes(f.type) || (f.type === "button" && f.options.webhookId !== undefined)) {
      skipped.push(f.name);
      return false;
    }
    return true;
  });
  for (let grew = true; grew; ) {
    grew = false;
    for (const f of pending.filter((x) => !keptIds.has(x.id))) {
      const source = f.type === "formula" ? f.options.expression : f.type === "button" ? f.options.url : undefined;
      let refs: number[] = [];
      try {
        refs = source ? formulaRefs(parseFormula(source)).map((r) => Number(r.slice(1))) : [];
      } catch {
        refs = [];
      }
      if (refs.every((id) => keptIds.has(id))) {
        kept.push(f);
        keptIds.add(f.id);
        grew = true;
      }
    }
  }
  for (const f of pending) if (!keptIds.has(f.id)) skipped.push(f.name);
  return { kept: reg.fieldsOf(tableId).filter((f) => keptIds.has(f.id)), skipped };
}

/** POST /registry/tables/:t/duplicate (admins): the fields, the views and (if asked) the records of a table. */
export async function duplicateTable(tableRef: string | number, input: { name?: string; records: boolean }) {
  const actor = await getCurrentUser();
  requireAdmin(actor);
  const { reg, table } = await managed(tableRef);
  const name = input.name ?? freeName(table.name, reg.snapshot.tables.map((t) => t.name));
  if (reg.snapshot.tables.some((t) => t.name.toLowerCase() === name.toLowerCase())) throw conflict(`There is already a table called ${name}`);
  const { kept, skipped } = copiable(reg, table.id);
  const id = await registryWrite(actor, "api", async (w) => {
    const [{ next }] = (await w.tx.select({ next: sql<number>`coalesce(max(${regTable.position}), 0) + 1` }).from(regTable)) as [{ next: number }];
    const [made] = await w.tx.insert(regTable).values({ name, description: table.description, icon: table.icon, section: table.section, position: next }).returning({ id: regTable.id });
    const ids = new Map<number, number>();
    for (const f of kept) {
      const [copy] = await w.tx.insert(regField).values({ tableId: made!.id, name: f.name, type: f.type, options: f.options, required: f.required, uniqueValues: f.unique, description: f.description, position: f.position }).returning({ id: regField.id });
      ids.set(f.id, copy!.id);
    }
    // formulas and buttons read the copies of their fields
    for (const f of kept.filter((x) => x.type === "formula" || (x.type === "button" && x.options.url))) {
      const key = f.type === "formula" ? "expression" : "url";
      const moved = (f.options[key] ?? "").replace(/\{#(\d+)\}/g, (_m, n: string) => `{#${ids.get(Number(n)) ?? n}}`);
      await w.tx.update(regField).set({ options: { ...f.options, [key]: moved } as FieldOptions }).where(eq(regField.id, ids.get(f.id)!));
    }
    const primary = table.primaryFieldId === null ? undefined : ids.get(table.primaryFieldId);
    await w.tx.update(regTable).set({ primaryFieldId: primary ?? ids.values().next().value ?? null }).where(eq(regTable.id, made!.id));
    for (const v of reg.viewsOf(table.id)) {
      const { sharedPassword: _hash, ...config } = v.config;
      await w.tx.insert(regView).values({ tableId: made!.id, name: v.name, type: v.type, position: v.position, slug: null, config: remapConfig({ ...config, group: undefined, shared: undefined }, ids) });
    }
    if (input.records) {
      for (const r of reg.recordsOf(table.id)) {
        const data = Object.fromEntries(kept.filter((f) => isStored(f.type) && f.type !== "attachment" && r.data[String(f.id)] !== undefined).map((f) => [String(ids.get(f.id)), f.type === "uuid" ? randomUUID() : r.data[String(f.id)]]));
        await w.tx.insert(regRecord).values({ tableId: made!.id, data, createdBy: actor.id, updatedBy: actor.id });
      }
    }
    w.touched.add(made!.id);
    return made!.id;
  });
  return { ...(await getTable(id)), skippedFields: skipped };
}

/** The type that fits every value of a column of a file (NocoDB guesses the same way). */
function guessType(values: string[]): FieldType {
  const filled = values.map((v) => v.trim()).filter((v) => v !== "");
  if (filled.length === 0) return "text";
  const all = (test: (v: string) => boolean) => filled.every(test);
  if (all((v) => /^(true|false|yes|no|sì|si|x)$/i.test(v)) && filled.some((v) => /^(true|yes|sì|si|x)$/i.test(v))) return "checkbox";
  if (all((v) => /^-?\d+([.,]\d+)?$/.test(v))) return "number";
  if (all((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) || /^\d{1,2}[/.-]\d{1,2}[/.-]\d{4}$/.test(v))) return "date";
  if (all((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))) return "email";
  if (all((v) => /^https?:\/\/\S+$/i.test(v))) return "url";
  if (filled.some((v) => v.length > 1_000 || v.includes("\n"))) return "longtext";
  return "text";
}

/** POST /registry/tables/import (admins): a table from a CSV, one field per column with the type its values fit. */
export async function tableFromCsv(input: { name: string; section?: string; csv: string }) {
  const actor = await getCurrentUser();
  requireAdmin(actor);
  const [header, ...lines] = parseCsv(input.csv);
  if (!header || header.length === 0) throw invalid("The file is empty");
  const names = header.map((h, i) => h.trim().replace(/[{}]/g, "") || `Column ${i + 1}`);
  if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) throw invalid("Two columns have the same name");
  const schema = openRegistry(await loadRegistry(db, []));
  if (schema.snapshot.tables.some((t) => t.name.toLowerCase() === input.name.trim().toLowerCase())) throw conflict(`There is already a table called ${input.name}`);
  const types = names.map((_, i) => guessType(lines.map((cells) => cells[i] ?? "")));
  const id = await registryWrite(actor, "import", async (w) => {
    const [{ next }] = (await w.tx.select({ next: sql<number>`coalesce(max(${regTable.position}), 0) + 1` }).from(regTable)) as [{ next: number }];
    const [made] = await w.tx.insert(regTable).values({ name: input.name.trim(), section: input.section ?? "", position: next }).returning({ id: regTable.id });
    const fields: Field[] = [];
    for (const [i, name] of names.entries()) {
      const options: FieldOptions = types[i] === "number" ? { precision: Math.min(6, Math.max(0, ...lines.map((c) => (c[i] ?? "").split(/[.,]/)[1]?.length ?? 0))) } : {};
      const [f] = await w.tx.insert(regField).values({ tableId: made!.id, name, type: types[i]!, options, position: i + 1 }).returning({ id: regField.id });
      fields.push({ id: f!.id, tableId: made!.id, name, type: types[i]!, options, required: false, unique: false, description: "", position: i + 1 });
    }
    await w.tx.update(regTable).set({ primaryFieldId: fields[0]!.id }).where(eq(regTable.id, made!.id));
    await w.tx.insert(regView).values({ tableId: made!.id, name: "All", type: "grid", position: 1 });
    const changes = lines
      .filter((cells) => cells.some((c) => c.trim() !== ""))
      .map((cells) => {
        const values = new Map<number, unknown>();
        fields.forEach((f, i) => {
          const result = normalizeValue(f, fromText(f.type, cells[i] ?? ""));
          // a value that does not fit is left empty: the column type was guessed from the others
          if (result.ok && result.value !== null) values.set(f.id, result.value);
        });
        return { values };
      });
    if (changes.length) await saveRecords(w, made!.id, changes);
    return made!.id;
  });
  return getTable(id);
}


