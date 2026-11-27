import type { AccessLevel, AccessRule, Choice, FieldOptions, FieldType, Filter, FormConfig, ViewConfig, ViewType } from "@erp/registry";
import { http, upload } from "./client";

// The registry (docs/anagrafiche.md, §10): its own list of endpoints, apart from the rest of the ERP. Only the
// types of @erp/registry are used here: no code of the engine runs in the browser.

export type { AccessRule, Choice, FieldType, Filter, FormConfig, ViewConfig };

export interface RegField {
  id: number;
  name: string;
  type: FieldType;
  options: FieldOptions;
  required: boolean;
  unique: boolean;
  description: string;
  position: number;
}

export interface RegView {
  id: number;
  name: string;
  type: ViewType;
  position: number;
  slug: string | null;
  /** The hash of the password of a shared view stays on the server: here only whether it has one. */
  config: Omit<ViewConfig, "sharedPassword"> & { hasPassword?: boolean; sharedPassword?: string | null };
}

export interface RegTableSummary {
  id: number;
  name: string;
  description: string;
  icon: string;
  section: string;
  level: AccessLevel;
}

export interface RegTable extends Omit<RegTableSummary, "level"> {
  primaryFieldId: number | null;
  isPeople: boolean;
  level: AccessLevel | null;
  /** Ids of the fields the person may change on the table as a whole. */
  writable: number[];
  fields: RegField[];
  views: RegView[];
  access?: AccessRule[];
}

export interface LinkedRef {
  id: number;
  name: string;
}

export interface FileRef {
  id: number;
  name: string;
  mime: string;
  size: number;
}

export interface RegRecord {
  id: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  fields: Record<string, unknown>;
  /** Its colour in the view, when the view colours its records. */
  color?: string | null;
}

export interface RecordDetail extends RegRecord {
  canEdit: boolean;
  /** The names of the fields the person may change in this record. */
  writable: string[];
}

export interface RecordList {
  records: RegRecord[];
  total: number;
  offset: number;
  limit: number;
  groups?: { key: string; keys: string[]; count: number; aggregates?: { field: string; fn: string; value: number | string | null }[] }[];
  aggregates?: { field: string; fn: string; value: number | string | null }[];
  fields: { id: number; name: string; type: FieldType }[];
  canCreate: boolean;
}

export interface RegComment {
  id: number;
  text: string;
  at: string;
  editedAt: string | null;
  resolved: boolean;
  author: string;
  mine: boolean;
}

export interface HistoryItem {
  at: string;
  actor: string;
  action: string;
  changes: { field: string; before: unknown; after: unknown }[];
}

export interface WebhookOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: string | null;
  /** By name: an update calls it only if one of these changed. */
  fields?: string[];
  when?: "matches" | "becomes";
}

export interface Webhook {
  id: number;
  name: string;
  url: string;
  events: string[];
  filter: Filter | null;
  secret: string;
  active: boolean;
  options: WebhookOptions;
}

export interface WebhookCall {
  id: number;
  at: string;
  event: string;
  recordId: number | null;
  status: number | null;
  error: string | null;
}

export interface RegistrySettings {
  peopleTableId: number | null;
  emailFieldId: number | null;
  groups: { id: number; name: string }[];
}

export interface FormQuestion {
  fieldId: number;
  name: string;
  type: FieldType;
  label: string;
  help: string;
  required: boolean;
  showIf?: Filter;
  validate?: FormConfig["fields"][number]["validate"];
  options: FieldOptions;
  choices?: LinkedRef[];
}

export interface PublicForm {
  slug: string;
  title: string;
  description: string;
  submitLabel: string;
  mode: "create" | "update";
  target: string | null;
  closed: string | null;
  questions: FormQuestion[];
  pick?: LinkedRef[];
  current?: Record<string, unknown>;
  /** Answers may come in the address (`?Field=value`): editable, hidden or shown read-only; null: not. */
  prefill: "edit" | "hide" | "lock" | null;
  submitAnother: boolean;
  blankAfter: boolean;
  survey: boolean;
  access: "public" | "members" | "group";
  person: string | null;
}

export interface MyForm {
  id: number;
  slug: string;
  name: string;
  table: string;
  access: string;
}

export interface RoleSync {
  enabled: boolean;
  activeViewId: number | null;
  adminViewId: number | null;
  pmViewId: number | null;
  pmAreasFieldId: number | null;
  treasuryViewId: number | null;
  sponsorsViewId: number | null;
  peopleTableId: number | null;
  groups: { id: number; name: string }[];
  fields: { id: number; name: string; type: FieldType }[];
}

export interface RoleChange {
  email: string;
  name: string;
  create: boolean;
  changes: Record<string, { from: unknown; to: unknown }>;
}

export interface ImportResult {
  rows: number;
  create: number;
  update: number;
  ignoredColumns: string[];
  errors: { row: number; message: string }[];
  saved: boolean;
}

const t = (table: string | number) => `/registry/tables/${encodeURIComponent(String(table))}`;
const formBase = (signedIn: boolean) => (signedIn ? "/registry/forms/by-slug" : "/registry/public/forms");

export const registry = {
  tables: () => http.get<RegTableSummary[]>("/registry/tables"),
  table: (table: string | number) => http.get<RegTable>(t(table)),
  createTable: (body: { name: string; section?: string; description?: string; icon?: string }) => http.post<RegTable>("/registry/tables", body),
  updateTable: (table: number, body: Partial<{ name: string; section: string; description: string; icon: string; primaryFieldId: number; access: AccessRule[] }>) => http.patch<RegTable>(t(table), body),
  deleteTable: (table: number) => http.del(t(table)),
  duplicateTable: (table: number, body: { name?: string; records: boolean }) => http.post<RegTable & { skippedFields: string[] }>(`${t(table)}/duplicate`, body),
  tableFromCsv: (body: { name: string; section?: string; csv: string }) => http.post<RegTable>("/registry/tables/import", body),

  createField: (table: number, body: { name: string; type: FieldType; options?: FieldOptions; required?: boolean; unique?: boolean; description?: string; inverseName?: string; inverseMultiple?: boolean }) =>
    http.post<RegField>(`${t(table)}/fields`, body),
  updateField: (id: number, body: Partial<{ name: string; type: FieldType; options: FieldOptions; required: boolean; unique: boolean; description: string }>) => http.patch<RegField & { lostValues: number }>(`/registry/fields/${id}`, body),
  deleteField: (id: number) => http.del(`/registry/fields/${id}`),
  duplicateField: (id: number) => http.post<RegField>(`/registry/fields/${id}/duplicate`, {}),
  orderFields: (table: number, ids: number[]) => http.put<RegTable>(`${t(table)}/fields/order`, { ids }),

  createView: (table: number, body: { name: string; type: ViewType; slug?: string | null; config?: ViewConfig }) => http.post<RegView>(`${t(table)}/views`, body),
  updateView: (id: number, body: Partial<{ name: string; slug: string | null; config: RegView["config"]; position: number }>) => http.patch<RegView>(`/registry/views/${id}`, body),
  deleteView: (id: number) => http.del(`/registry/views/${id}`),
  duplicateView: (id: number) => http.post<RegView>(`/registry/views/${id}/duplicate`, {}),

  names: (table: number, view?: number) => http.get<LinkedRef[]>(`${t(table)}/names${view ? `?view=${view}` : ""}`),
  records: (table: number, query: URLSearchParams) => http.get<RecordList>(`${t(table)}/records?${query}`),
  record: (table: number, id: number) => http.get<RecordDetail>(`${t(table)}/records/${id}`),
  createRecord: (table: number, fields: Record<string, unknown>) => http.post<RegRecord>(`${t(table)}/records`, { fields }),
  updateRecord: (table: number, id: number, fields: Record<string, unknown>, version?: number) => http.patch<RegRecord>(`${t(table)}/records/${id}`, { fields, version }),
  updateRecords: (table: number, items: { id: number; fields: Record<string, unknown> }[]) => http.patch<RegRecord[]>(`${t(table)}/records`, items),
  tileUrl: (z: number, x: number, y: number) => `/api/registry/tiles/${z}/${x}/${y}.png`,
  deleteRecord: (table: number, id: number) => http.del(`${t(table)}/records/${id}`),
  duplicateRecord: (table: number, id: number) => http.post<RegRecord>(`${t(table)}/records/${id}/duplicate`, {}),
  bulkDelete: (table: number, ids: number[]) => http.post<{ deleted: number }>(`${t(table)}/records/bulk-delete`, { ids }),
  bulkUpdate: (table: number, ids: number[], fields: Record<string, unknown>) => http.post<{ updated: number }>(`${t(table)}/records/bulk-update`, { ids, fields }),
  history: (table: number, id: number) => http.get<HistoryItem[]>(`${t(table)}/records/${id}/history`),
  comments: (table: number, id: number) => http.get<RegComment[]>(`${t(table)}/records/${id}/comments`),
  addComment: (table: number, id: number, text: string) => http.post<RegComment[]>(`${t(table)}/records/${id}/comments`, { text }),
  deleteComment: (id: number) => http.del(`/registry/comments/${id}`),
  editComment: (id: number, text: string) => http.patch<RegComment[]>(`/registry/comments/${id}`, { text }),
  resolveComment: (id: number, resolved: boolean) => http.post<RegComment[]>(`/registry/comments/${id}/resolve`, { resolved }),
  users: () => http.get<LinkedRef[]>("/registry/users"),
  uploadFile: (table: number, id: number, field: string, file: File) => upload<RegRecord>(`${t(table)}/records/${id}/files/${encodeURIComponent(field)}?name=${encodeURIComponent(file.name)}`, file),
  deleteFile: (id: number) => http.del(`/registry/files/${id}`),
  fileUrl: (id: number) => `/api/registry/files/${id}`,
  pressButton: (table: number, id: number, field: string) => http.post<{ ok: true; url?: string }>(`${t(table)}/records/${id}/buttons/${encodeURIComponent(field)}`, {}),
  exportUrl: (table: number, query: URLSearchParams, kind: "csv" | "json" | "ics" = "csv") => `/api${t(table)}/export.${kind}?${query}`,
  exportJson: (table: number, query: URLSearchParams) => http.get<RegRecord[]>(`${t(table)}/export.json?${query}`),
  importCsv: (table: number, body: { csv: string; mode: "create" | "upsert"; key?: string; dryRun: boolean }) => http.post<ImportResult>(`${t(table)}/import`, body),

  webhooks: (table: number) => http.get<Webhook[]>(`${t(table)}/webhooks`),
  createWebhook: (table: number, body: { name: string; url: string; events: string[]; filter?: Filter | null } & WebhookOptions) => http.post<Webhook>(`${t(table)}/webhooks`, body),
  updateWebhook: (id: number, body: Partial<{ name: string; url: string; events: string[]; active: boolean; filter: Filter | null } & WebhookOptions>) => http.patch<Webhook>(`/registry/webhooks/${id}`, body),
  deleteWebhook: (id: number) => http.del(`/registry/webhooks/${id}`),
  duplicateWebhook: (id: number) => http.post<Webhook>(`/registry/webhooks/${id}/duplicate`, {}),
  webhookLog: (id: number) => http.get<WebhookCall[]>(`/registry/webhooks/${id}/log`),
  testWebhook: (id: number) => http.post<{ status: number | null; error: string | null }>(`/registry/webhooks/${id}/test`, {}),

  settings: () => http.get<RegistrySettings>("/registry/settings"),
  setSettings: (body: { peopleTableId: number | null; emailFieldId: number | null }) => http.put<RegistrySettings>("/registry/settings", body),
  myForms: () => http.get<MyForm[]>("/registry/forms"),
  personalLink: (viewId: number, recordId: number, days: number) => http.post<{ path: string; token: string; expires: string }>(`/registry/forms/${viewId}/links`, { recordId, days }),
  /** A form: at the public address (nobody is known there), or at the one behind the sign-in (`signedIn`). */
  form: (slug: string, token: string | undefined, signedIn: boolean) =>
    http.get<PublicForm>(`${formBase(signedIn)}/${encodeURIComponent(slug)}${token ? `?t=${encodeURIComponent(token)}` : ""}`),
  submit: (slug: string, signedIn: boolean, body: { answers: Record<string, unknown>; files?: Record<string, { name: string; mime: string; data: string }[]>; recordId?: number; token?: string }) =>
    http.post<{ ok: true; message: string; redirectUrl: string | null }>(`${formBase(signedIn)}/${encodeURIComponent(slug)}`, body),

  roleSync: () => http.get<RoleSync>("/registry-access/role-sync"),
  setRoleSync: (body: Partial<RoleSync>) => http.put<RoleSync & { applied: number; warnings: string[] }>("/registry-access/role-sync", body),
  previewRoleSync: (body: Partial<RoleSync>) => http.post<{ changes: RoleChange[]; warnings: string[] }>("/registry-access/role-sync/preview", body),
};
