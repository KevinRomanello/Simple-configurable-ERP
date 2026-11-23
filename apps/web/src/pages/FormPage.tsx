import { faPaperPlane } from "@fortawesome/free-solid-svg-icons";
import type { Condition, Filter } from "@erp/registry";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useParams, useSearchParams } from "react-router";
import { ApiError } from "../api/client";
import { registry, type FormQuestion, type LinkedRef, type PublicForm } from "../api/registry";
import { Button } from "../components/Button";
import { ValueInput } from "../components/registry/Values";
import { SearchSelect } from "../components/SearchSelect";
import { Field } from "../components/ui";
import { readAsBase64 } from "../lib/registry";

/**
 * A form of the registry, on a page of its own (docs/anagrafiche.md, §8): for the candidates too, who have no
 * account, and on a phone. The server checks everything again; here a question shown only under a condition is
 * hidden as the answers change. Not designed in Figma: built from the boxes and buttons of the other pages.
 */
export function FormPage() {
  const slug = useParams().slug ?? "";
  const [params] = useSearchParams();
  const token = params.get("t") ?? undefined;
  const form = useQuery({ queryKey: ["public-form", slug, token], queryFn: () => loadForm(slug, token), retry: false });
  return (
    <main className="public-form">
      {form.error && (
        <p className="empty">
          {form.error instanceof ApiError && form.error.status === 401 ? <>This form is for the members: <a href="/">sign in to the site</a>, then open this link again.</> : form.error.message}
        </p>
      )}
      {!form.data && !form.error && <p className="empty">Loading…</p>}
      {form.data && <FormBody key={form.data.form.slug} form={form.data.form} signedIn={form.data.signedIn} slug={slug} token={token} prefill={params} />}
    </main>
  );
}

/**
 * The form from its public address, where nobody is known; a form for the members asks again at the address
 * behind the sign-in (docs/anagrafiche.md, §8.4).
 */
async function loadForm(slug: string, token: string | undefined): Promise<{ form: PublicForm; signedIn: boolean }> {
  try {
    return { form: await registry.form(slug, token, false), signedIn: false };
  } catch (error) {
    if (!(error instanceof ApiError && error.code === "sign-in-needed")) throw error;
    try {
      return { form: await registry.form(slug, token, true), signedIn: true };
    } catch (again) {
      // not signed in (or the login proxy answered instead of the ERP): the page says to sign in
      throw again instanceof ApiError && again.status !== 401 ? again : error;
    }
  }
}

/** The answers of a form not sent yet, kept in this browser for a month (NocoDB does the same). */
const DRAFT_DAYS = 30;
const draftKey = (slug: string) => `form-draft:${slug}`;
function readDraft(slug: string): Record<string, unknown> | null {
  try {
    const saved = JSON.parse(localStorage.getItem(draftKey(slug)) ?? "null") as { at: number; answers: Record<string, unknown> } | null;
    return saved && Date.now() - saved.at < DRAFT_DAYS * 86_400_000 ? saved.answers : null;
  } catch {
    return null;
  }
}
function writeDraft(slug: string, answers: Record<string, unknown> | null) {
  try {
    if (answers === null) localStorage.removeItem(draftKey(slug));
    else localStorage.setItem(draftKey(slug), JSON.stringify({ at: Date.now(), answers }));
  } catch {
    // a browser that keeps nothing: the draft is only lost
  }
}

/** The answers already there (a form that changes a record) or given in the address: links as ids. */
function startingAnswers(form: PublicForm, prefill: URLSearchParams): { answers: Record<string, unknown>; given: Set<number> } {
  const out: Record<string, unknown> = {};
  const givenIds = new Set<number>();
  for (const q of form.questions) {
    const current = form.current?.[String(q.fieldId)];
    if (current !== undefined && q.type !== "attachment") out[String(q.fieldId)] = q.type === "link" && Array.isArray(current) ? (current as LinkedRef[]).map((r) => r.id) : current;
    const given = form.prefill ? prefill.get(q.name) : null;
    if (given !== null && given !== undefined) {
      givenIds.add(q.fieldId);
      if (q.type === "link") {
        const found = q.choices?.find((c) => c.name.toLowerCase() === given.toLowerCase() || String(c.id) === given);
        if (found) out[String(q.fieldId)] = [found.id];
      } else if (q.type === "multiselect") out[String(q.fieldId)] = given.split(",").map((s) => s.trim());
      else out[String(q.fieldId)] = q.type === "checkbox" ? given === "true" : given;
    }
  }
  return { answers: out, given: givenIds };
}

/** Whether a question is shown: the simple conditions of the form, checked on the answers so far. */
function shown(q: FormQuestion, answers: Record<string, unknown>, questions: FormQuestion[]): boolean {
  if (!q.showIf || q.showIf.items.length === 0) return true;
  const check = (item: Condition | Filter): boolean => {
    if ("items" in item) return item.join === "or" ? item.items.some(check) : item.items.every(check);
    const source = questions.find((x) => x.fieldId === item.field);
    let value = answers[String(item.field)];
    // a link answers with ids: the conditions speak of names too
    if (source?.type === "link" && Array.isArray(value)) value = (value as number[]).flatMap((id) => [String(id), source.choices?.find((c) => c.id === id)?.name.toLowerCase() ?? ""]);
    const items = (Array.isArray(value) ? value : value === undefined || value === null || value === "" ? [] : [value]).map((v) => String(v).toLowerCase());
    const wanted = (Array.isArray(item.value) ? item.value : [item.value]).map((v) => String(v ?? "").toLowerCase());
    switch (item.op) {
      case "empty": return items.length === 0 || value === false;
      case "notEmpty": return items.length > 0 && value !== false;
      case "checked": return value === true;
      case "notChecked": return value !== true;
      case "eq": case "anyOf": return wanted.some((w) => items.includes(w));
      case "neq": case "noneOf": return !wanted.some((w) => items.includes(w));
      case "allOf": return wanted.every((w) => items.includes(w));
      case "notAllOf": return !wanted.every((w) => items.includes(w));
      case "contains": return items.some((i) => i.includes(wanted[0] ?? ""));
      default: return true;
    }
  };
  return check(q.showIf);
}

function FormBody({ form, slug, token, prefill, signedIn }: { form: PublicForm; slug: string; token?: string; prefill: URLSearchParams; signedIn: boolean }) {
  const start = startingAnswers(form, prefill);
  // only a new record keeps a draft: a form that changes one starts from its values
  const keepsDraft = form.mode === "create";
  const [answers, setAnswers] = useState<Record<string, unknown>>(() => ({ ...(keepsDraft ? readDraft(slug) : null), ...start.answers }));
  const [restored] = useState(() => keepsDraft && readDraft(slug) !== null);
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [picked, setPicked] = useState("");
  const [problems, setProblems] = useState<{ field: string | null; message: string }[]>([]);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [done]);
  useEffect(() => {
    if (keepsDraft && done === null) writeDraft(slug, answers);
  }, [answers]);
  // "a blank form after five seconds"
  useEffect(() => {
    if (done === null || !form.blankAfter) return;
    const timer = setTimeout(() => again(), 5_000);
    return () => clearTimeout(timer);
  }, [done]);

  const again = () => {
    setAnswers(startingAnswers(form, prefill).answers);
    setFiles({});
    setPicked("");
    setStep(0);
    setDone(null);
  };

  if (form.closed) return <FormShell form={form}><p className="empty">{form.closed}</p></FormShell>;
  if (done !== null) {
    return (
      <FormShell form={form}>
        <p className="pre-wrap">{done}</p>
        {form.blankAfter && <p className="hint">A blank form comes back in a few seconds.</p>}
        {form.submitAnother && <div><Button variant="ghost" onClick={again}>Submit another answer</Button></div>}
      </FormShell>
    );
  }

  // a question given in the address may be hidden, or shown without being changed
  const prefilled = (q: FormQuestion) => start.given.has(q.fieldId);
  const visible = form.questions.filter((q) => shown(q, answers, form.questions));
  const asked = visible.filter((q) => !(form.prefill === "hide" && prefilled(q)));
  // one question at a time ("survey mode")
  const page = form.survey ? asked.slice(Math.min(step, asked.length - 1), Math.min(step, asked.length - 1) + 1) : asked;
  const last = !form.survey || step >= asked.length - 1;
  const problemOf = (q: FormQuestion) => problems.filter((p) => p.field === q.name).map((p) => p.message).join(" ");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!last) {
      setStep(step + 1);
      return;
    }
    setSending(true);
    setProblems([]);
    try {
      const sent: Record<string, { name: string; mime: string; data: string }[]> = {};
      for (const [fieldId, list] of Object.entries(files)) {
        if (!visible.some((q) => String(q.fieldId) === fieldId)) continue;
        sent[fieldId] = await Promise.all(list.map(async (f) => ({ name: f.name, mime: f.type || "application/octet-stream", data: await readAsBase64(f) })));
      }
      const kept = Object.fromEntries(Object.entries(answers).filter(([id]) => visible.some((q) => String(q.fieldId) === id)));
      const result = await registry.submit(slug, signedIn, { answers: kept, files: sent, token, recordId: picked ? Number(picked) : undefined });
      if (keepsDraft) writeDraft(slug, null);
      if (result.redirectUrl) window.location.assign(result.redirectUrl);
      else setDone(result.message);
    } catch (error) {
      const found = problemsOf(error);
      setProblems(found);
      // in survey mode, back to the first question with a problem
      const first = asked.findIndex((q) => found.some((p) => p.field === q.name));
      if (form.survey && first >= 0) setStep(first);
    } finally {
      setSending(false);
    }
  };

  return (
    <FormShell form={form}>
      <form className="stack tight" onSubmit={submit} noValidate>
        {restored && <p className="hint">Your answers of last time are back. <button type="button" className="link-button" onClick={() => { writeDraft(slug, null); setAnswers(start.answers); }}>Start again</button></p>}
        {form.survey && asked.length > 0 && <p className="label-s muted">Question {Math.min(step, asked.length - 1) + 1} of {asked.length}</p>}
        {form.pick && (!form.survey || step === 0) && (
          <Field label="Who" htmlFor="form-pick">
            <SearchSelect id="form-pick" value={picked} choices={[{ value: "", label: "Choose…" }, ...form.pick.map((p) => ({ value: String(p.id), label: p.name }))]} onChange={setPicked} />
          </Field>
        )}
        {page.map((q) => (
          <Field key={q.fieldId} label={<>{q.label}{q.required ? " *" : ""}</>} htmlFor={`q-${q.fieldId}`}>
            {q.help && <span className="hint pre-wrap">{q.help}</span>}
            {q.type === "attachment" ? (
              <input
                id={`q-${q.fieldId}`}
                type="file"
                multiple={(q.options.maxFiles ?? 20) > 1}
                accept={(q.options.accept ?? []).join(",") || undefined}
                onChange={(e) => setFiles({ ...files, [String(q.fieldId)]: [...(e.target.files ?? [])] })}
              />
            ) : (
              <ValueInput
                id={`q-${q.fieldId}`}
                field={q}
                disabled={form.prefill === "lock" && prefilled(q)}
                value={q.type === "link" ? ((answers[String(q.fieldId)] as number[] | undefined) ?? []).map((id) => q.choices?.find((c) => c.id === id) ?? { id, name: `#${id}` }) : answers[String(q.fieldId)]}
                choices={q.choices}
                onChange={(v) => setAnswers({ ...answers, [String(q.fieldId)]: v })}
              />
            )}
            {problemOf(q) && <span className="hint error">{problemOf(q)}</span>}
          </Field>
        ))}
        {problems.filter((p) => !visible.some((q) => q.name === p.field)).map((p, i) => <p key={i} className="hint error">{p.message}</p>)}
        <div className="inline-form">
          {form.survey && step > 0 && <Button variant="ghost" onClick={() => setStep(step - 1)}>Back</Button>}
          {last ? (
            <Button icon={faPaperPlane} type="submit" disabled={sending || (form.pick !== undefined && picked === "")}>{sending ? "Sending…" : form.submitLabel}</Button>
          ) : (
            <Button type="submit">Next</Button>
          )}
        </div>
      </form>
    </FormShell>
  );
}

/** What a refused submission says, question by question when the server tells. */
function problemsOf(error: unknown): { field: string | null; message: string }[] {
  const details = (error as { details?: unknown }).details;
  if (Array.isArray(details)) return details as { field: string | null; message: string }[];
  return [{ field: null, message: error instanceof Error ? error.message : "Something went wrong" }];
}

function FormShell({ form, children }: { form: PublicForm; children: ReactNode }) {
  return (
    <article className="panel public-form-card">
      <header>
        <p className="label-s muted">E-Agle TRT</p>
        <h1>{form.title}</h1>
        {form.person && <p className="muted">Signed in as {form.person}</p>}
        {form.description && <p className="pre-wrap">{form.description}</p>}
      </header>
      {children}
    </article>
  );
}
