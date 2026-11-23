import type { AccessRule, Field, FieldOptions, FieldType, FileMeta, Link, RecordRow, RegistrySnapshot, Table, View, ViewConfig, ViewType } from "@erp/registry";
import { eq, inArray } from "drizzle-orm";
import { today } from "../../core/today";
import { db } from "../../db/client";
import { appUser, regField, regFile, regLink, regRecord, regSettings, regTable, regView } from "../../db/schema";

// From the database to the snapshot of the engine: the whole description of the registry (tables, fields,
// views: small), and the records of the tables a request needs, with every table they link to.

type Reader = Pick<typeof db, "select">;

const iso = (d: Date | string) => (d instanceof Date ? d.toISOString() : new Date(d).toISOString());

/**
 * The registry as the engine wants it. `focus`: the tables whose records are needed (with the tables they
 * link to, and the people table, which says who is looking); all of them when not given.
 */
export async function loadRegistry(reader: Reader = db, focus?: number[]): Promise<RegistrySnapshot> {
  // one query after the other: inside a transaction they share one connection, which takes one at a time
  const tableRows = await reader.select().from(regTable);
  const fieldRows = await reader.select().from(regField);
  const viewRows = await reader.select().from(regView);
  const settingsRows = await reader.select().from(regSettings).where(eq(regSettings.id, 1));
  const userRows = await reader.select({ id: appUser.id, name: appUser.name, email: appUser.email }).from(appUser);
  const settings = { peopleTableId: settingsRows[0]?.peopleTableId ?? null, emailFieldId: settingsRows[0]?.emailFieldId ?? null };

  const tables: Table[] = tableRows.map((t) => ({
    id: t.id, name: t.name, description: t.description, icon: t.icon, section: t.section, position: t.position, primaryFieldId: t.primaryFieldId, access: t.access as AccessRule[],
  }));
  const fields: Field[] = fieldRows.map((f) => ({
    id: f.id, tableId: f.tableId, name: f.name, type: f.type as FieldType, options: f.options as FieldOptions, required: f.required, unique: f.uniqueValues, description: f.description, position: f.position,
  }));
  const views: View[] = viewRows.map((v) => ({ id: v.id, tableId: v.tableId, name: v.name, type: v.type as ViewType, position: v.position, slug: v.slug, config: v.config as ViewConfig }));

  // the tables to load: the ones asked for, the people, and every table reachable through their links
  const wanted = new Set(focus ?? tables.map((t) => t.id));
  if (settings.peopleTableId !== null) wanted.add(settings.peopleTableId);
  for (let grew = true; grew; ) {
    grew = false;
    for (const f of fields) {
      if (f.type === "link" && wanted.has(f.tableId) && f.options.tableId !== undefined && !wanted.has(f.options.tableId)) {
        wanted.add(f.options.tableId);
        grew = true;
      }
    }
  }
  const tableIds = [...wanted];
  const linkFieldIds = fields.filter((f) => f.type === "link" && wanted.has(f.tableId)).map((f) => f.id);

  const none = tableIds.length === 0;
  const recordRows = none ? [] : await reader.select().from(regRecord).where(inArray(regRecord.tableId, tableIds));
  const linkRows = none || linkFieldIds.length === 0 ? [] : await reader.select().from(regLink).where(inArray(regLink.fieldId, linkFieldIds));
  const fileRows = none
    ? []
    : await reader
        .select({ id: regFile.id, recordId: regFile.recordId, fieldId: regFile.fieldId, name: regFile.name, mime: regFile.mime, size: regFile.sizeBytes })
        .from(regFile)
        .innerJoin(regRecord, eq(regRecord.id, regFile.recordId))
        .where(inArray(regRecord.tableId, tableIds));

  const records: RecordRow[] = recordRows.map((r) => ({
    id: r.id, tableId: r.tableId, data: r.data as Record<string, unknown>, version: r.version, createdAt: iso(r.createdAt), createdBy: r.createdBy, updatedAt: iso(r.updatedAt), updatedBy: r.updatedBy,
  }));
  const links: Link[] = linkRows.map((l) => ({ fieldId: l.fieldId, recordId: l.recordId, targetId: l.targetId, position: l.position }));
  const files: FileMeta[] = fileRows;
  const now = new Date();
  return { tables, fields, views, records, links, files, users: userRows, settings, today: today(now), now: now.toISOString() };
}
