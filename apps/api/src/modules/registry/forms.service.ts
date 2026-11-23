import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  formClosedReason, matches, normalizeValue, openRegistry, planSubmission, runQuery, textOf, toCsv,
  type Field, type FormConfig, type RecordRow, type Registry, type Table, type View, type Viewer,
} from "@erp/registry";
import { eq, sql } from "drizzle-orm";
import type { z } from "zod";
import { AppError, forbidden, invalid, notFound } from "../../core/errors";
import { db } from "../../db/client";
import { appSecret, appUser, regFile, regView } from "../../db/schema";
import { needRecord, signedInUser, tableOf, viewerOf } from "./registry.access";
import { loadRegistry } from "./registry.data";
import type { submitInput } from "./registry.schema";
import { checkFile, disposition, readFile } from "./records.service";
import { recordOut, registryWrite, saveRecords } from "./registry.write";
import { passwordMatches } from "./schema.service";

// Forms (docs/anagrafiche.md, §8): a view of the `form` kind with an address, filled in by the candidates,
// the members or a group, which creates a record or changes one: the person's own, the one of a signed
// personal link, or one picked from a view. Also the public read-only views (§10.2).

async function formBySlug(slug: string) {
  const [row] = await db.select().from(regView).where(sql`lower(${regView.slug}) = ${slug.toLowerCase()}`);
  if (!row || row.type !== "form") throw notFound("Form");
  const reg = openRegistry(await loadRegistry(db, [row.tableId]));
  const view = reg.view(row.id)!;
  const form = view.config.form;
  if (!form) throw notFound("Form");
  return { reg, view, form, table: tableOf(reg, row.tableId), viewer: viewerOf(reg) };
}

/** Whether the person may fill the form in: anybody (public), the signed-in members, a group. */
function mayFill(form: FormConfig, viewer: Viewer) {
  if (form.access.kind === "public" || viewer.isAdmin) return;
  // the public address never knows who is there (docs/anagrafiche.md, §8.4): the page asks again, signed in
  if (viewer.userId === null) throw new AppError(401, "Sign in to fill in this form", "sign-in-needed");
  if (form.access.kind === "group" && !viewer.groups.includes(form.access.groupId)) throw forbidden("This form is for another group");
}

// --- personal links ---------------------------------------------------------------------------------

/** The key of the personal links, made the first time it is needed and kept in the database. */
async function linkSecret(): Promise<string> {
  const [row] = await db.select().from(appSecret).where(eq(appSecret.name, "form-links"));
  if (row) return row.value;
  await db.insert(appSecret).values({ name: "form-links", value: randomBytes(32).toString("hex") }).onConflictDoNothing();
  const [made] = await db.select().from(appSecret).where(eq(appSecret.name, "form-links"));
  return made!.value;
}

const sign = (secret: string, text: string) => createHmac("sha256", secret).update(text).digest("base64url").slice(0, 32);

/** POST /registry/forms/:id/links: a personal link for one record (who may change the records of the table). */
export async function createPersonalLink(viewId: number, recordId: number, days: number) {
  const [row] = await db.select().from(regView).where(eq(regView.id, viewId));
  if (!row || row.type !== "form") throw notFound("Form");
  const reg = openRegistry(await loadRegistry(db, [row.tableId]));
  const view = reg.view(viewId)!;
  const table = tableOf(reg, row.tableId);
  if (view.config.form?.target !== "link") throw invalid("This form is not opened with personal links");
  const record = reg.record(recordId);
  if (!record || record.tableId !== table.id) throw notFound("Record");
  needRecord(reg, table, record, viewerOf(reg), "edit");
  const expires = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  const text = `${viewId}.${recordId}.${expires}`;
  const token = `${text}.${sign(await linkSecret(), text)}`;
  return { path: `/forms/${view.slug}?t=${token}`, token, expires };
}

/** The record a personal link opens, if the link is genuine, for this form and not expired. */
async function recordOfLink(view: View, token: string | undefined, today: string): Promise<number> {
  const parts = (token ?? "").split(".");
  if (parts.length !== 4) throw forbidden("This form opens only from the personal link you received");
  const [formId, recordId, expires, sig] = parts as [string, string, string, string];
  const expected = sign(await linkSecret(), `${formId}.${recordId}.${expires}`);
  const same = sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  if (!same || Number(formId) !== view.id) throw forbidden("This link is not valid: ask for a new one");
  if (expires < today) throw forbidden("This link has expired: ask for a new one");
  return Number(recordId);
}

// --- filling in -----------------------------------------------------------------------------------

/** The record a form of the `update` kind changes, for the person filling it in. */
async function baseRecord(reg: Registry, table: Table, form: FormConfig, view: View, viewer: Viewer, input: { recordId?: number; token?: string }): Promise<RecordRow | null> {
  if (form.mode === "create") return null;
  let id: number | undefined;
  if (form.target === "me") {
    if (viewer.personId === null) throw notFound("Your record in the registry");
    id = viewer.personId;
  } else if (form.target === "link") {
    id = await recordOfLink(view, input.token, reg.snapshot.today);
  } else {
    id = input.recordId;
    const pick = form.pickViewId === undefined ? undefined : reg.view(form.pickViewId);
    const record = id === undefined ? undefined : reg.record(id);
    if (!record || record.tableId !== table.id || !pick) throw invalid("Choose the record to change");
    if (!matches(reg, record, pick.config.filter, filterEnv(reg, viewer))) throw invalid("That record cannot be chosen here");
  }
  if (id === undefined) throw invalid("Choose the record to change");
  const record = reg.record(id);
  if (!record || record.tableId !== table.id) throw notFound("Record");
  return record;
}

const filterEnv = (reg: Registry, viewer: Viewer) => ({ today: reg.snapshot.today, peopleTableId: reg.snapshot.settings.peopleTableId, me: { email: viewer.email, personId: viewer.personId } });

/** The questions as the page shows them: label, help, kind of answer, its choices and checks. */
async function questions(reg: Registry, form: FormConfig, viewer: Viewer) {
  // the people of the ERP are offered only to who is signed in: a public form does not list them
  const users = form.fields.some((q) => reg.field(q.fieldId)?.type === "user") && viewer.userId !== null
    ? (await db.select({ id: appUser.id, name: appUser.name }).from(appUser).where(eq(appUser.active, true))).sort((a, b) => a.name.localeCompare(b.name, "it"))
    : [];
  return form.fields.flatMap((q) => {
    const field = reg.field(q.fieldId);
    if (!field) return [];
    const choices =
      field.type === "link"
        ? reg.recordsOf(field.options.tableId ?? 0).map((r) => ({ id: r.id, name: reg.display(r.id) })).sort((a, b) => a.name.localeCompare(b.name, "it"))
        : field.type === "user"
          ? users
          : undefined;
    const { default: _default, ...options } = field.options;
    return [{ fieldId: field.id, name: field.name, type: field.type, label: q.label ?? field.name, help: q.help ?? field.description, required: q.required ?? field.required, showIf: q.showIf, validate: q.validate, options, choices }];
  });
}

/** GET /registry/public/forms/:slug: what to show (with the current values, for a form that changes a record). */
export async function getForm(slug: string, input: { token?: string }) {
  const { reg, view, form, table, viewer } = await formBySlug(slug);
  mayFill(form, viewer);
  const closed = formClosedReason(form, reg.snapshot.today);
  const pick =
    form.mode === "update" && form.target === "pick" && form.pickViewId !== undefined
      ? runQuery(reg, reg.recordsOf(table.id), { filter: reg.view(form.pickViewId)?.config.filter, sorts: reg.view(form.pickViewId)?.config.sorts }, filterEnv(reg, viewer)).records.map((r) => ({ id: r.id, name: reg.display(r.id) }))
      : undefined;
  let current: Record<string, unknown> | undefined;
  if (!closed && form.mode === "update" && form.target !== "pick") {
    const record = await baseRecord(reg, table, form, view, viewer, input);
    if (record) current = Object.fromEntries(form.fields.map((q) => reg.field(q.fieldId)).filter((f): f is Field => f !== undefined).map((f) => [String(f.id), reg.output(record, f)]));
  }
  return {
    slug: view.slug,
    title: form.title ?? view.name,
    description: form.description ?? "",
    submitLabel: form.submitLabel ?? "Submit",
    mode: form.mode,
    target: form.target ?? null,
    closed,
    questions: await questions(reg, form, viewer),
    pick,
    current,
    prefill: form.prefill === true ? "edit" : (form.prefill || null),
    submitAnother: form.submitAnother === true,
    blankAfter: form.blankAfter === true,
    survey: form.survey === true,
    access: form.access.kind,
    person: viewer.personId === null ? null : reg.display(viewer.personId),
  };
}

/** POST /registry/public/forms/:slug: checks the answers, writes the record and its files, answers what to show. */
export async function submitForm(slug: string, input: z.infer<typeof submitInput>) {
  const { reg, view, form, table, viewer } = await formBySlug(slug);
  mayFill(form, viewer);
  const closed = formClosedReason(form, reg.snapshot.today);
  if (closed) throw new AppError(409, closed);
  const base = await baseRecord(reg, table, form, view, viewer, input);

  // answers and files by field id; only the questions of the form count
  const asked = new Map(form.fields.map((q) => [q.fieldId, q]));
  const answers: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input.answers)) {
    const field = reg.findField(table.id, key);
    if (field && asked.has(field.id) && field.type !== "attachment") answers[String(field.id)] = value;
  }
  const uploads = new Map<number, { name: string; mime: string; bytes: Buffer }[]>();
  const problems: { field: string | null; message: string }[] = [];
  for (const [key, files] of Object.entries(input.files ?? {})) {
    const field = reg.findField(table.id, key);
    if (!field || !asked.has(field.id) || field.type !== "attachment") continue;
    const list = files.map((f) => ({ name: f.name, mime: f.mime, bytes: Buffer.from(f.data, "base64") }));
    try {
      if (list.length > (field.options.maxFiles ?? 20)) throw invalid(`${field.name}: at most ${field.options.maxFiles ?? 20} files`);
      for (const f of list) checkFile(field, f.name, f.mime, f.bytes.length);
      uploads.set(field.id, list);
    } catch (error) {
      problems.push({ field: field.name, message: (error as Error).message });
    }
  }

  const user = signedInUser();
  const plan = planSubmission(reg.snapshot, table, form, answers, base, { viewer, today: reg.snapshot.today, now: reg.snapshot.now });
  if (!plan.ok) for (const e of plan.errors) problems.push({ field: e.fieldId === null ? null : (reg.field(e.fieldId)?.name ?? null), message: e.message });
  // a required question with files: the files sent, or the ones already there
  for (const q of form.fields) {
    const field = reg.field(q.fieldId);
    if (field?.type !== "attachment" || !(q.required ?? field.required)) continue;
    const already = base ? ((base.data[String(field.id)] as unknown[] | undefined) ?? []).length : 0;
    if (!uploads.get(field.id)?.length && already === 0) problems.push({ field: field.name, message: `${q.label ?? field.name} is required` });
  }
  // the problems drop answers to hidden questions, and say nothing twice
  const unique = problems.filter((p, i) => problems.findIndex((o) => o.message === p.message) === i);
  if (unique.length > 0 || !plan.ok) throw new AppError(400, unique[0]?.message ?? "Some answers need a look", undefined, unique);

  const values = new Map<number, unknown>(Object.entries(plan.changes).map(([id, v]) => [Number(id), v]));
  const recordId = await registryWrite(user, `form:${view.slug}`, async (w) => {
    const [id] = await saveRecords(w, table.id, [{ id: base?.id, values }]);
    if (uploads.size > 0) {
      const fileValues = new Map<number, unknown>();
      for (const [fieldId, list] of uploads) {
        const ids: number[] = [];
        for (const f of list) {
          const [row] = await w.tx.insert(regFile).values({ recordId: id!, fieldId, name: f.name, mime: f.mime, sizeBytes: f.bytes.length, data: f.bytes, uploadedBy: user?.id ?? null }).returning({ id: regFile.id });
          ids.push(row!.id);
        }
        // a form replaces the files of its question (the new CV in place of the old one)
        fileValues.set(fieldId, normalizeOk(reg.field(fieldId)!, ids));
      }
      await saveRecords(w, table.id, [{ id: id!, values: fileValues }]);
    }
    return id!;
  });
  return { ok: true, message: form.successMessage ?? "Thank you: your answers have been saved.", redirectUrl: form.redirectUrl ?? null, recordId: user ? recordId : null };
}

function normalizeOk(field: Field, ids: number[]) {
  const result = normalizeValue(field, ids);
  if (!result.ok) throw invalid(result.error);
  return result.value;
}

/** GET /registry/forms: the forms the person may fill in (for the menu). */
export async function listMyForms() {
  const reg = openRegistry(await loadRegistry(db, []));
  const viewer = viewerOf(reg);
  return reg.snapshot.views
    .filter((v) => v.type === "form" && v.config.form && v.slug)
    .filter((v) => {
      const access = v.config.form!.access;
      return viewer.isAdmin || access.kind !== "group" || viewer.groups.includes(access.groupId);
    })
    // a form opened only from personal links is not listed: it needs its link
    .filter((v) => v.config.form!.target !== "link")
    .map((v) => ({ id: v.id, slug: v.slug!, name: v.config.form!.title ?? v.name, table: reg.table(v.tableId)?.name ?? "", access: v.config.form!.access.kind }));
}

// --- public views -----------------------------------------------------------------------------------

/** A shared view, if it is shared and the password (when it has one) is the right one. */
async function sharedView(slug: string, password: string | undefined) {
  const [row] = await db.select().from(regView).where(sql`lower(${regView.slug}) = ${slug.toLowerCase()}`);
  if (!row || row.type === "form" || !(row.config as { shared?: boolean }).shared) throw notFound("View");
  const reg = openRegistry(await loadRegistry(db, [row.tableId]));
  const view = reg.view(row.id)!;
  if (view.config.sharedPassword && !(password && passwordMatches(view.config.sharedPassword, password))) {
    throw new AppError(401, password ? "That is not the password of this view" : "This view asks for a password", "password-needed");
  }
  const table = tableOf(reg, row.tableId);
  const hidden = new Set(view.config.hidden ?? []);
  const fields = reg.fieldsOf(table.id).filter((f) => !hidden.has(f.id) && f.type !== "button");
  const env = { today: reg.snapshot.today, peopleTableId: reg.snapshot.settings.peopleTableId };
  const records = runQuery(reg, reg.recordsOf(table.id), { filter: view.config.filter, sorts: view.config.sorts }, env).records;
  return { reg, view, table, fields, records };
}

/** GET /registry/public/views/:slug: the records of a shared view, with its fields only, for anybody. */
export async function getSharedView(slug: string, password?: string) {
  const { reg, view, table, fields, records } = await sharedView(slug, password);
  return {
    name: view.name,
    table: table.name,
    type: view.type,
    download: view.config.sharedDownload === true,
    fields: fields.map((f) => ({ name: f.name, type: f.type })),
    records: records.map((r) => recordOut(reg, r, fields)),
  };
}

/** GET /registry/public/views/:slug/export.csv: the shared view as CSV, when it lets people download it. */
export async function getSharedCsv(slug: string, password?: string) {
  const { reg, view, fields, records } = await sharedView(slug, password);
  if (!view.config.sharedDownload) throw notFound("Download");
  return { name: view.name, csv: `\uFEFF${toCsv([fields.map((f) => f.name), ...records.map((r) => fields.map((f) => textOf(reg.output(r, f))))])}` };
}

/** GET /registry/public/views/:slug/files/:id: a file of a record of a shared view, in a field it shows. */
export async function getSharedFile(slug: string, fileId: number, password?: string) {
  const { reg, fields, records } = await sharedView(slug, password);
  const file = reg.file(fileId);
  if (!file || !records.some((r) => r.id === file.recordId) || !fields.some((f) => f.id === file.fieldId)) throw notFound("File");
  const data = await readFile(fileId);
  return { ...data, ...disposition(data.name, data.mime, data.data) };
}
