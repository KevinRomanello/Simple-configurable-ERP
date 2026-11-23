import { faCheck, faClockRotateLeft, faClone, faComment, faFloppyDisk, faLink, faPen, faTrash, faUpload, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { registry, type FileRef, type RegField, type RegTable } from "../../api/registry";
import { Button, IconButton } from "../../components/Button";
import { ValueInput, ValueView } from "../../components/registry/Values";
import { Field } from "../../components/ui";
import { COMPUTED, showValue } from "../../lib/registry";
import { useAction } from "../../lib/useAction";
import { useNotify } from "../../components/Notice";

/**
 * A record of the registry at the side of its table: every field the person may see, the ones they may change
 * as boxes, the files, the buttons and, on request, the history. `recordId` null: a new record.
 * Not designed in Figma: built from the boxes and buttons of the other pages.
 */
export function RecordPanel({ table, recordId, onClose, onCreated }: { table: RegTable; recordId: number | null; onClose: () => void; onCreated: (id: number) => void }) {
  const notify = useNotify();
  const act = useAction();
  const record = useQuery({ queryKey: ["registry-record", table.id, recordId], queryFn: () => registry.record(table.id, recordId!), enabled: recordId !== null });
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [side, setSide] = useState<"fields" | "history" | "comments">("fields");
  useEffect(() => {
    setDraft({});
  }, [recordId]);

  const writable = new Set(recordId === null ? table.fields.filter((f) => table.writable.includes(f.id)).map((f) => f.name) : (record.data?.writable ?? []));
  const linkFields = table.fields.filter((f) => f.type === "link" && writable.has(f.name));
  // a link may offer only the records of a view of the linked table (NocoDB's "limit record selection")
  const choices = useQueries({ queries: linkFields.map((f) => ({ queryKey: ["registry-names", f.options.tableId, f.options.limitViewId], queryFn: () => registry.names(f.options.tableId!, f.options.limitViewId) })) });
  const users = useQuery({ queryKey: ["registry-users"], queryFn: () => registry.users(), enabled: table.fields.some((f) => f.type === "user" && writable.has(f.name)) });
  const choicesOf = (f: RegField) => (f.type === "user" ? users.data : choices[linkFields.indexOf(f)]?.data);

  const values = record.data?.fields ?? {};
  const shown = recordId === null ? table.fields.filter((f) => writable.has(f.name) && f.type !== "attachment") : table.fields.filter((f) => f.name in values);
  const changed = Object.keys(draft).length > 0;
  const current = (f: RegField) => (f.name in draft ? draft[f.name] : values[f.name]);
  // a link edited shows the names of the records chosen
  const shownValue = (f: RegField) => {
    const v = current(f);
    if ((f.type === "link" || f.type === "user") && Array.isArray(v) && v.every((x) => typeof x === "number")) return (v as number[]).map((id) => ({ id, name: choicesOf(f)?.find((c) => c.id === id)?.name ?? `#${id}` }));
    return v;
  };

  const save = async () => {
    if (recordId === null) {
      let created = 0;
      if (await act(async () => (created = (await registry.createRecord(table.id, draft)).id))) onCreated(created);
      return;
    }
    if (await act(() => registry.updateRecord(table.id, recordId, draft, record.data?.version))) setDraft({});
  };
  const remove = async () => {
    if (recordId !== null && window.confirm("Delete this record? Its links and files go with it.")) if (await act(() => registry.deleteRecord(table.id, recordId))) onClose();
  };
  const duplicate = async () => {
    let copy = 0;
    if (recordId !== null && (await act(async () => (copy = (await registry.duplicateRecord(table.id, recordId)).id)))) onCreated(copy);
  };
  // the address that opens this record (NocoDB's "Copy record URL")
  const copyLink = async () => {
    const url = `${window.location.origin}/registry/${table.id}?record=${recordId}`;
    try {
      await navigator.clipboard.writeText(url);
      notify("info", "The link of the record is copied");
    } catch {
      window.prompt("The link of the record", url);
    }
  };
  const press = async (f: RegField) => {
    let url: string | undefined;
    if (!(await act(async () => (url = (await registry.pressButton(table.id, recordId!, f.name)).url)))) return;
    // a button that opens an address: only web addresses, in a new tab
    if (url && /^https?:\/\//i.test(url)) window.open(url, "_blank", "noopener");
    else notify("info", "Sent");
  };
  const title = recordId === null ? `New record in ${table.name}` : showValue({ type: "text", options: {} }, values[table.fields.find((f) => f.id === table.primaryFieldId)?.name ?? ""]) || `#${recordId}`;

  return (
    <aside className="record-panel" aria-label="Record">
      <div className="panel-head">
        <h2>{title}</h2>
        <span className="spacer" />
        {recordId !== null && <IconButton icon={faLink} label="Copy the link of the record" onClick={copyLink} />}
        {recordId !== null && table.writable.length > 0 && <IconButton icon={faClone} label="Duplicate the record" onClick={duplicate} />}
        {recordId !== null && <IconButton icon={faComment} label="Comments" onClick={() => setSide(side === "comments" ? "fields" : "comments")} />}
        {recordId !== null && <IconButton icon={faClockRotateLeft} label="History" onClick={() => setSide(side === "history" ? "fields" : "history")} />}
        {recordId !== null && record.data?.canEdit && <IconButton icon={faTrash} label="Delete record" danger onClick={remove} />}
        <IconButton icon={faXmark} label="Close" onClick={onClose} />
      </div>
      {side === "history" && recordId !== null ? (
        <History tableId={table.id} recordId={recordId} />
      ) : side === "comments" && recordId !== null ? (
        <Comments tableId={table.id} recordId={recordId} />
      ) : (
        <form className="stack tight" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          {shown.map((f) => (
            <Field key={f.id} label={<>{f.name}{f.required && writable.has(f.name) ? " *" : ""}</>} htmlFor={`record-${f.id}`}>
              {f.type === "attachment" ? (
                <Files table={table} recordId={recordId!} field={f} files={(values[f.name] as FileRef[] | undefined) ?? []} canEdit={writable.has(f.name)} />
              ) : f.type === "button" ? (
                <Button small variant="ghost" disabled={!f.options.url && !record.data?.canEdit} onClick={() => press(f)}>{f.options.label ?? f.name}</Button>
              ) : writable.has(f.name) && !COMPUTED.includes(f.type) ? (
                <ValueInput id={`record-${f.id}`} field={f} value={shownValue(f)} choices={choicesOf(f)} onChange={(v) => setDraft({ ...draft, [f.name]: v })} />
              ) : (
                <span className="value"><ValueView field={f} value={values[f.name]} /></span>
              )}
              {f.description && <span className="hint">{f.description}</span>}
            </Field>
          ))}
          {(changed || recordId === null) && (
            <div className="inline-form">
              <Button small icon={faFloppyDisk} type="submit" disabled={!changed}>{recordId === null ? "Create" : "Save"}</Button>
              {recordId !== null && <Button small variant="ghost" onClick={() => setDraft({})}>Undo changes</Button>}
            </div>
          )}
        </form>
      )}
    </aside>
  );
}

/** The files of a field: open, remove, add (uploaded at once). */
function Files({ table, recordId, field, files, canEdit }: { table: RegTable; recordId: number; field: RegField; files: FileRef[]; canEdit: boolean }) {
  const act = useAction();
  return (
    <div className="stack tight">
      {files.map((f) => (
        <span key={f.id} className="file-row">
          <a href={registry.fileUrl(f.id)} target="_blank" rel="noreferrer">{f.name}</a>
          <span className="muted label-s">{Math.ceil(f.size / 1024)} KB</span>
          {canEdit && <IconButton icon={faTrash} label={`Remove ${f.name}`} danger onClick={() => act(() => registry.deleteFile(f.id))} />}
        </span>
      ))}
      {canEdit && (
        <label className="btn small ghost file-pick">
          <input
            type="file"
            accept={(field.options.accept ?? []).join(",") || undefined}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void act(() => registry.uploadFile(table.id, recordId, field.name, file));
            }}
          />
          <span><FontAwesomeIcon icon={faUpload} /> Add a file</span>
        </label>
      )}
    </div>
  );
}

/** A moment of the server (UTC) in the time of this computer. */
const when = (iso: string) => new Date(iso).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });

/**
 * The comments on the record: who may read it may write one; the author changes or deletes theirs, and
 * whoever may change the record marks one resolved (it stays, greyed).
 */
function Comments({ tableId, recordId }: { tableId: number; recordId: number }) {
  const act = useAction();
  const comments = useQuery({ queryKey: ["registry-comments", tableId, recordId], queryFn: () => registry.comments(tableId, recordId) });
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);
  return (
    <div className="stack tight">
      {comments.data?.length === 0 && <p className="muted">No comments yet.</p>}
      <ol className="history-list">
        {(comments.data ?? []).map((c) => (
          <li key={c.id} className={c.resolved ? "resolved" : undefined}>
            <span className="label-s muted">{when(c.at)} · {c.author}{c.editedAt ? " · edited" : ""}{c.resolved ? " · resolved" : ""}</span>
            <IconButton icon={faCheck} label={c.resolved ? "Open the comment again" : "Mark the comment resolved"} onClick={() => act(() => registry.resolveComment(c.id, !c.resolved))} />
            {c.mine && <IconButton icon={faPen} label="Change the comment" onClick={() => setEditing({ id: c.id, text: c.text })} />}
            {c.mine && <IconButton icon={faTrash} label="Delete the comment" onClick={() => act(() => registry.deleteComment(c.id))} />}
            {editing?.id === c.id ? (
              <div className="stack tight">
                <textarea className="input" rows={3} aria-label="The comment" value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} />
                <div className="inline-form">
                  <Button small disabled={editing.text.trim() === ""} onClick={async () => { if (await act(() => registry.editComment(c.id, editing.text.trim()))) setEditing(null); }}>Save</Button>
                  <Button small variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="pre-wrap">{c.text}</div>
            )}
          </li>
        ))}
      </ol>
      <textarea className="input" rows={3} aria-label="New comment" placeholder="Write a comment" value={text} onChange={(e) => setText(e.target.value)} />
      <div>
        <Button small disabled={text.trim() === ""} onClick={async () => { if (await act(() => registry.addComment(tableId, recordId, text.trim()))) setText(""); }}>Comment</Button>
      </div>
    </div>
  );
}

/** What changed in the record, who and when: only the fields the person may see. */
function History({ tableId, recordId }: { tableId: number; recordId: number }) {
  const history = useQuery({ queryKey: ["registry-history", tableId, recordId], queryFn: () => registry.history(tableId, recordId) });
  if (!history.data) return <p className="muted">Loading…</p>;
  if (history.data.length === 0) return <p className="muted">No changes yet.</p>;
  const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));
  return (
    <ol className="history-list">
      {history.data.map((h, i) => (
        <li key={i}>
          <span className="label-s muted">{when(h.at)} · {h.actor} · {h.action}</span>
          {h.changes.map((c, j) => (
            <div key={j}>
              <strong>{c.field}</strong>: {h.action === "link" || h.action === "unlink" ? `${h.action === "link" ? "+" : "−"} ${show(c.after)}` : `${show(c.before)} → ${show(c.after)}`}
            </div>
          ))}
        </li>
      ))}
    </ol>
  );
}
