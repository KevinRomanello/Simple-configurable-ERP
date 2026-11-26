import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { registry } from "../../api/registry";
import { DraftNote } from "../../components/DraftNote";
import { Field, FormPanel, Loading, PageHeader, Panel } from "../../components/ui";
import { useMe } from "../../lib/auth";
import { sheetAsCsv } from "../../lib/registrySheet";
import { useAction } from "../../lib/useAction";
import { fieldSetter, useDraft } from "../../lib/useDraft";

/** REGISTRY: the tables the person may see, by section, and the forms they may fill in (docs/anagrafiche.md). */
export function RegistryHome() {
  const isAdmin = useMe().role === "admin";
  const tables = useQuery({ queryKey: ["registry-tables"], queryFn: registry.tables });
  const forms = useQuery({ queryKey: ["registry-forms"], queryFn: registry.myForms });
  if (!tables.data) return <Loading />;
  const sections = [...new Set(tables.data.map((t) => t.section))];
  return (
    <>
      <PageHeader
        title="REGISTRY"
        description="The registries of the team: people, areas, projects, certificates, anything. Fields, views and forms are chosen here, like in NocoDB; who sees what is chosen per table."
        add={isAdmin ? { label: "New table", draftKey: "registry:new-table", form: (close) => <NewTable onDone={close} /> } : undefined}
      />
      {tables.data.length === 0 && <p className="empty">{isAdmin ? "No tables yet: add the first one." : "There is nothing for you here yet."}</p>}
      {sections.map((section) => (
        <Panel key={section} title={section || "Tables"}>
          <ul className="link-list">
            {tables.data.filter((t) => t.section === section).map((t) => (
              <li key={t.id}>
                <Link to={`/registry/${t.id}`}>{t.icon} {t.name}</Link>
                {t.description && <span className="muted"> · {t.description}</span>}
              </li>
            ))}
          </ul>
        </Panel>
      ))}
      {(forms.data?.length ?? 0) > 0 && (
        <Panel title="Forms">
          <ul className="link-list">
            {forms.data!.map((f) => (
              <li key={f.id}>
                <a href={`/forms/${f.slug}`}>{f.name}</a> <span className="muted">· {f.table}{f.access === "public" ? " · public" : ""}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}

function NewTable({ onDone }: { onDone: () => void }) {
  const act = useAction();
  const navigate = useNavigate();
  const [form, setForm, saved] = useDraft("registry:new-table", { name: "", section: "" });
  const { name, section } = form;
  const set = fieldSetter(setForm);
  // a file is not kept: it has to be chosen again
  const [file, setFile] = useState<File | null>(null);
  // from a file: one field per column, with the type its values fit (NocoDB's "Create table from CSV / Excel")
  const make = async () => {
    if (!file) return registry.createTable({ name: name.trim(), section: section.trim() });
    const csv = file.name.toLowerCase().endsWith(".xlsx") ? await sheetAsCsv(file) : await file.text();
    return registry.tableFromCsv({ name: name.trim(), section: section.trim(), csv });
  };
  const add = async () => {
    let id = 0;
    if (await act(async () => (id = (await make()).id))) {
      saved.discard();
      onDone();
      navigate(`/registry/${id}`);
    }
  };
  return (
    <FormPanel title="New table" description="It starts with a Name field and a view of all its records; or with the columns and rows of a file." submitLabel="Add table" canSubmit={name.trim() !== ""} onSubmit={add} onCancel={() => saved.leave(onDone)}>
      <DraftNote draft={saved} />
      <Field label="Name" htmlFor="table-new-name"><input id="table-new-name" className="input small" value={name} autoFocus onChange={(e) => set("name")(e.target.value)} /></Field>
      <Field label="Section" htmlFor="table-new-section"><input id="table-new-section" className="input small" placeholder="HR & Recruitment" value={section} onChange={(e) => set("section")(e.target.value)} /></Field>
      <Field label="From a file (optional)" htmlFor="table-new-file">
        <input id="table-new-file" type="file" accept=".csv,text/csv,.xlsx" onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); if (f && !name) set("name")(f.name.replace(/\.(csv|xlsx)$/i, "")); }} />
      </Field>
    </FormPanel>
  );
}
