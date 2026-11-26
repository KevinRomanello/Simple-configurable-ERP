import { faCopy, faGripVertical, faPen, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import type { FormAccess, FormConfig, FormField, FormSet } from "@erp/registry";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { registry, type RegTable, type RegView } from "../../api/registry";
import { useDragOrder } from "../../lib/useDragOrder";
import { Button, IconButton } from "../../components/Button";
import { Chips } from "../../components/Chips";
import { SearchSelect } from "../../components/SearchSelect";
import { Field, FormPanel, Panel, RowAction, Table, TableScroll } from "../../components/ui";
import { COMPUTED } from "../../lib/registry";
import { useAction } from "../../lib/useAction";
import { FilterEditor } from "./ViewTools";

// The forms of a table (docs/anagrafiche.md, §8): who fills them in, whether they add a record or change one,
// the questions, what they set by themselves, and the message at the end. In place of the Google Forms.

const formUrl = (slug: string) => `${window.location.origin}/forms/${slug}`;

export function FormsTab({ table }: { table: RegTable }) {
  const act = useAction();
  const forms = table.views.filter((v) => v.type === "form");
  const [editing, setEditing] = useState<RegView | "new" | null>(null);
  return (
    <>
      <Panel title="Forms" actions={<Button small icon={faPlus} onClick={() => setEditing("new")}>New form</Button>}>
        {editing === "new" && (
          <RowAction loose eyebrow="New form" title={`In ${table.name}`} onClose={() => setEditing(null)}>
            <FormEditor key="new" table={table} view={null} onDone={() => setEditing(null)} />
          </RowAction>
        )}
        {forms.length === 0 && <p className="muted">No forms yet. A form adds a record (an application) or changes one (onboarding, exit, an HR assessment).</p>}
        {forms.length > 0 && (
          <TableScroll>
            <Table>
              <thead><tr><th>FORM</th><th>WHO AND WHAT</th><th>ADDRESS</th><th /></tr></thead>
              <tbody>
                {forms.map((v) => (
                  <Fragment key={v.id}>
                    <tr className={editing !== null && editing !== "new" && editing.id === v.id ? "row-selected" : undefined}>
                      <td>{v.config.form?.title ?? v.name}</td>
                      <td className="muted">{v.config.form?.access.kind} · {v.config.form?.mode === "create" ? "adds a record" : `changes ${v.config.form?.target === "me" ? "the person's own record" : v.config.form?.target === "link" ? "the record of a personal link" : "a record picked"}`}</td>
                      <td className="mono"><a href={formUrl(v.slug ?? "")} target="_blank" rel="noreferrer">/forms/{v.slug}</a></td>
                      <td className="num nowrap">
                        <IconButton icon={faCopy} label="Copy the address" onClick={() => navigator.clipboard.writeText(formUrl(v.slug ?? ""))} />
                        <IconButton icon={faPen} label="Change the form" onClick={() => setEditing(v)} />
                        <IconButton icon={faTrash} label="Delete the form" danger onClick={() => window.confirm("Delete this form? The records it made stay.") && act(() => registry.deleteView(v.id))} />
                      </td>
                    </tr>
                    {editing !== null && editing !== "new" && editing.id === v.id && (
                      <RowAction colSpan={4} eyebrow="Change form" title={v.config.form?.title ?? v.name} context={[["Address", `/forms/${v.slug}`]]} onClose={() => setEditing(null)}>
                        <FormEditor key={v.id} table={table} view={v} onDone={() => setEditing(null)} />
                      </RowAction>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </Table>
          </TableScroll>
        )}
      </Panel>
      {forms.some((v) => v.config.form?.target === "link") && <PersonalLinks table={table} forms={forms.filter((v) => v.config.form?.target === "link")} />}
    </>
  );
}

const EMPTY_FORM: FormConfig = { access: { kind: "members" }, mode: "create", fields: [], set: [] };

function FormEditor({ table, view, onDone }: { table: RegTable; view: RegView | null; onDone: () => void }) {
  const act = useAction();
  const settings = useQuery({ queryKey: ["registry-settings"], queryFn: registry.settings });
  const [name, setName] = useState(view?.name ?? "");
  const [slug, setSlug] = useState(view?.slug ?? "");
  const [form, setForm] = useState<FormConfig>(view?.config.form ?? EMPTY_FORM);
  const set = (change: Partial<FormConfig>) => setForm({ ...form, ...change });
  const askable = table.fields.filter((f) => !COMPUTED.includes(f.type) && !form.fields.some((q) => q.fieldId === f.id));
  const settable = table.fields.filter((f) => !COMPUTED.includes(f.type) && f.type !== "attachment");
  const groups = settings.data?.groups ?? [];
  const accessValue = form.access.kind === "group" ? `group:${form.access.groupId}` : form.access.kind;
  const question = (i: number, change: Partial<FormField>) => set({ fields: form.fields.map((q, k) => (k === i ? { ...q, ...change } : q)) });
  const rule = (i: number, change: Partial<FormSet>) => set({ set: (form.set ?? []).map((s, k) => (k === i ? { ...s, ...change } : s)) });
  // the order of the questions is the handle of each one, as in every list (docs/stile-interfaccia.md, point 22)
  const drag = useDragOrder(form.fields.map((q) => q.fieldId), (ids) => set({ fields: ids.map((id) => form.fields.find((q) => q.fieldId === id)!) }));

  const save = async () => {
    const config = { form };
    const done = view ? await act(() => registry.updateView(view.id, { name, slug, config })) : await act(() => registry.createView(table.id, { name, type: "form", slug, config }));
    if (done) onDone();
  };
  const grids = table.views.filter((v) => v.type === "grid");

  return (
    <FormPanel title={view ? `The form ${view.name}` : "New form"} submitLabel={view ? "Save the form" : "Add the form"} canSubmit={name.trim() !== "" && /^[a-z0-9-]+$/.test(slug)} onSubmit={save} onCancel={onDone} layout="stack">
      <div className="form-grid">
        <Field label="Name" htmlFor="form-name"><input id="form-name" className="input small" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Address: /forms/…" htmlFor="form-slug"><input id="form-slug" className="input small" placeholder="apply" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} /></Field>
        <Field label="Title" htmlFor="form-title"><input id="form-title" className="input small" value={form.title ?? ""} onChange={(e) => set({ title: e.target.value || undefined })} /></Field>
        <Field label="Who fills it in" htmlFor="form-access">
          <select
            id="form-access"
            className="input small"
            value={accessValue}
            onChange={(e) => set({ access: (e.target.value.startsWith("group:") ? { kind: "group", groupId: Number(e.target.value.slice(6)) } : { kind: e.target.value }) as FormAccess })}
          >
            <option value="public">Anybody with the address (no account)</option>
            <option value="members">Who signs in to the site</option>
            {groups.map((g) => <option key={g.id} value={`group:${g.id}`}>The group {g.name}</option>)}
          </select>
        </Field>
        <Field label="Introduction" htmlFor="form-description" className="wide"><textarea id="form-description" className="input" rows={3} value={form.description ?? ""} onChange={(e) => set({ description: e.target.value || undefined })} /></Field>
      </div>

      <Chips label="What it does" value={form.mode} onChange={(mode) => set({ mode, target: mode === "update" ? (form.target ?? "me") : undefined })} options={[{ value: "create", label: "Adds a record" }, { value: "update", label: "Changes a record" }]} />
      {form.mode === "update" && (
        <div className="inline-form">
          <Chips
            label="Which record"
            value={form.target ?? "me"}
            onChange={(target) => set({ target })}
            options={[
              ...(table.isPeople ? [{ value: "me" as const, label: "The person's own" }] : []),
              { value: "link" as const, label: "The one of a personal link" },
              { value: "pick" as const, label: "One picked from a view" },
            ]}
          />
          {form.target === "pick" && (
            <select className="input small" aria-label="Picked from" value={form.pickViewId ?? ""} onChange={(e) => set({ pickViewId: Number(e.target.value) })}>
              <option value="">Choose the view…</option>
              {grids.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          )}
        </div>
      )}

      <h3>Questions</h3>
      {form.fields.map((q, i) => {
        const field = table.fields.find((f) => f.id === q.fieldId);
        return (
          <div key={q.fieldId} className={`rule stack tight ${drag.classOf(q.fieldId)}`.trim()} {...drag.boxProps(q.fieldId)}>
            <div className="inline-form">
              {form.fields.length > 1 && <IconButton icon={faGripVertical} className="drag-handle" label={`Drag to move ${field?.name ?? "the question"} (or use the up and down arrow keys)`} {...drag.handle(q.fieldId)} />}
              <strong>{field?.name}</strong>
              <input className="input small" aria-label="Label" placeholder="Label (the name of the field)" value={q.label ?? ""} onChange={(e) => question(i, { label: e.target.value || undefined })} />
              <label className="checkbox"><input type="checkbox" checked={q.required ?? false} onChange={(e) => question(i, { required: e.target.checked })} /> Required</label>
              <IconButton icon={faTrash} label="Remove the question" danger onClick={() => set({ fields: form.fields.filter((_, k) => k !== i) })} />
            </div>
            <input className="input small" aria-label="Help" placeholder="Help under the question" value={q.help ?? ""} onChange={(e) => question(i, { help: e.target.value || undefined })} />
            {q.validate ? (
              <div className="inline-form">
                {["text", "longtext", "email", "url", "phone"].includes(field?.type ?? "") && (
                  <>
                    <input className="input small" type="number" min={0} aria-label="At least (characters)" placeholder="min chars" value={q.validate.minLength ?? ""} onChange={(e) => question(i, { validate: { ...q.validate, minLength: e.target.value === "" ? undefined : Number(e.target.value) } })} />
                    <input className="input small" type="number" min={1} aria-label="At most (characters)" placeholder="max chars" value={q.validate.maxLength ?? ""} onChange={(e) => question(i, { validate: { ...q.validate, maxLength: e.target.value === "" ? undefined : Number(e.target.value) } })} />
                    <input className="input small mono" aria-label="Pattern" placeholder="pattern, e.g. ^\d{6}$" value={q.validate.pattern ?? ""} onChange={(e) => question(i, { validate: { ...q.validate, pattern: e.target.value || undefined } })} />
                  </>
                )}
                {["number", "rating", "duration", "date", "datetime"].includes(field?.type ?? "") && (
                  <>
                    <input className="input small" aria-label="At least" placeholder={field?.type.startsWith("date") ? "from (today)" : "min"} value={String(q.validate.min ?? "")} onChange={(e) => question(i, { validate: { ...q.validate, min: e.target.value === "" ? undefined : isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value) } })} />
                    <input className="input small" aria-label="At most" placeholder={field?.type.startsWith("date") ? "until" : "max"} value={String(q.validate.max ?? "")} onChange={(e) => question(i, { validate: { ...q.validate, max: e.target.value === "" ? undefined : isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value) } })} />
                  </>
                )}
                <input className="input small" aria-label="Message" placeholder="What to say when it is wrong" value={q.validate.message ?? ""} onChange={(e) => question(i, { validate: { ...q.validate, message: e.target.value || undefined } })} />
                <IconButton icon={faTrash} label="Remove the checks" onClick={() => question(i, { validate: undefined })} />
              </div>
            ) : (
              <div><Button small variant="ghost" onClick={() => question(i, { validate: {} })}>Check the answer…</Button></div>
            )}
            {q.showIf ? (
              <Field label="Shown only if">
                <FilterEditor idPrefix={`showif-${i}`} fields={table.fields.filter((f) => form.fields.slice(0, i).some((x) => x.fieldId === f.id))} filter={q.showIf} onChange={(showIf) => question(i, { showIf: showIf.items.length ? showIf : undefined })} />
              </Field>
            ) : (
              i > 0 && <div><Button small variant="ghost" onClick={() => question(i, { showIf: { join: "and", items: [] } })}>Show only if…</Button></div>
            )}
          </div>
        );
      })}
      {askable.length > 0 && (
        <SearchSelect label="Add a question" value="" choices={[{ value: "", label: "Add a question…" }, ...askable.map((f) => ({ value: String(f.id), label: f.name }))]} onChange={(v) => v && set({ fields: [...form.fields, { fieldId: Number(v) }] })} />
      )}

      <h3>Set by itself on submit</h3>
      <p className="muted">A fixed value, or today, now, @me (the person filling it in). With a condition, only when the answers match it.</p>
      {(form.set ?? []).map((s, i) => {
        const field = table.fields.find((f) => f.id === s.fieldId);
        return (
          <div key={i} className="rule stack tight">
            <div className="inline-form">
              <select className="input small" aria-label="Field" value={s.fieldId} onChange={(e) => rule(i, { fieldId: Number(e.target.value) })}>
                {settable.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              =
              {field?.type === "select" ? (
                <select className="input small" aria-label="Value" value={String(s.value ?? "")} onChange={(e) => rule(i, { value: e.target.value })}>
                  {(field.options.choices ?? []).map((c) => <option key={c.name}>{c.name}</option>)}
                </select>
              ) : field?.type === "checkbox" ? (
                <select className="input small" aria-label="Value" value={String(s.value === true)} onChange={(e) => rule(i, { value: e.target.value === "true" })}>
                  <option value="true">checked</option><option value="false">not checked</option>
                </select>
              ) : (
                <input className="input small" aria-label="Value" placeholder="today, now, @me or a value" value={String(s.value ?? "")} onChange={(e) => rule(i, { value: e.target.value })} />
              )}
              <IconButton icon={faTrash} label="Remove" danger onClick={() => set({ set: (form.set ?? []).filter((_, k) => k !== i) })} />
            </div>
            {s.when ? (
              <Field label="Only if">
                <FilterEditor idPrefix={`when-${i}`} fields={table.fields} filter={s.when} onChange={(when) => rule(i, { when: when.items.length ? when : undefined })} />
              </Field>
            ) : (
              <div><Button small variant="ghost" onClick={() => rule(i, { when: { join: "and", items: [] } })}>Only if…</Button></div>
            )}
          </div>
        );
      })}
      {settable.length > 0 && <div><Button small variant="ghost" icon={faPlus} onClick={() => set({ set: [...(form.set ?? []), { fieldId: settable[0]!.id, value: "" }] })}>Add a value</Button></div>}

      <div className="form-grid">
        <Field label="Button" htmlFor="form-submit"><input id="form-submit" className="input small" placeholder="Submit" value={form.submitLabel ?? ""} onChange={(e) => set({ submitLabel: e.target.value || undefined })} /></Field>
        <Field label="Open from" htmlFor="form-opens"><input id="form-opens" className="input small" type="date" value={form.opensOn ?? ""} onChange={(e) => set({ opensOn: e.target.value || undefined })} /></Field>
        <Field label="Open until" htmlFor="form-closes"><input id="form-closes" className="input small" type="date" value={form.closesOn ?? ""} onChange={(e) => set({ closesOn: e.target.value || undefined })} /></Field>
        <Field label="Message at the end" htmlFor="form-success" className="wide"><textarea id="form-success" className="input" rows={2} value={form.successMessage ?? ""} onChange={(e) => set({ successMessage: e.target.value || undefined })} /></Field>
        <Field label="Or go to (https://…)" htmlFor="form-redirect" className="wide"><input id="form-redirect" className="input small" value={form.redirectUrl ?? ""} onChange={(e) => set({ redirectUrl: e.target.value || undefined })} /></Field>
      </div>
      <Field label="Answers in the address (?Area=SW)" htmlFor="form-prefill">
        <select id="form-prefill" className="input small" value={form.prefill === true ? "edit" : form.prefill || "no"} onChange={(e) => set({ prefill: e.target.value === "no" ? undefined : e.target.value === "edit" ? true : (e.target.value as "hide" | "lock") })}>
          <option value="no">No</option>
          <option value="edit">Yes, and they can be changed</option>
          <option value="lock">Yes, shown but not changed</option>
          <option value="hide">Yes, and those questions are hidden</option>
        </select>
      </Field>
      <div className="checks">
        <label className="checkbox"><input type="checkbox" checked={form.survey ?? false} onChange={(e) => set({ survey: e.target.checked || undefined })} /> One question at a time</label>
        <label className="checkbox"><input type="checkbox" checked={form.submitAnother ?? false} onChange={(e) => set({ submitAnother: e.target.checked || undefined })} /> After sending, a button to fill it in again</label>
        <label className="checkbox"><input type="checkbox" checked={form.blankAfter ?? false} onChange={(e) => set({ blankAfter: e.target.checked || undefined })} /> After sending, a blank form in five seconds (a kiosk)</label>
      </div>
    </FormPanel>
  );
}

/** Personal links: a form that changes the record of whoever gets the link (onboarding sent on Telegram). */
function PersonalLinks({ table, forms }: { table: RegTable; forms: RegView[] }) {
  const act = useAction();
  const names = useQuery({ queryKey: ["registry-names", table.id], queryFn: () => registry.names(table.id) });
  const [formId, setFormId] = useState(forms[0]!.id);
  const [recordId, setRecordId] = useState("");
  const [days, setDays] = useState(14);
  const [link, setLink] = useState<string | null>(null);
  return (
    <Panel title="Personal links">
      <p className="muted">The link opens the form on one record only, and expires. Make one per person (or let the bot make them with a token: POST /api/registry/forms/&lt;id&gt;/links).</p>
      <div className="inline-form">
        <select className="input small" aria-label="Form" value={formId} onChange={(e) => setFormId(Number(e.target.value))}>
          {forms.map((v) => <option key={v.id} value={v.id}>{v.config.form?.title ?? v.name}</option>)}
        </select>
        <SearchSelect label="Record" value={recordId} choices={[{ value: "", label: "Choose the record…" }, ...(names.data ?? []).map((n) => ({ value: String(n.id), label: n.name }))]} onChange={setRecordId} />
        <input className="input small" type="number" min={1} max={365} aria-label="Days" value={days} onChange={(e) => setDays(Number(e.target.value))} />
        <Button small disabled={recordId === ""} onClick={() => act(async () => setLink(`${window.location.origin}${(await registry.personalLink(formId, Number(recordId), days)).path}`))}>Make the link</Button>
      </div>
      {link && (
        <p className="mono">
          {link} <IconButton icon={faCopy} label="Copy the link" onClick={() => navigator.clipboard.writeText(link)} />
        </p>
      )}
    </Panel>
  );
}
