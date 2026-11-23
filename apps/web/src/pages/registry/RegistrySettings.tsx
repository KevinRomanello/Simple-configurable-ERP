import { faCopy, faTrash } from "@fortawesome/free-solid-svg-icons";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../api/client";
import { registry, type RoleChange, type RoleSync } from "../../api/registry";
import { Button, IconButton } from "../../components/Button";
import { Field, FormPanel, Loading, Panel } from "../../components/ui";
import { useAction } from "../../lib/useAction";

// Settings › Registry (admins): which table holds the people, the roles of the ERP taken from the registry, and
// the keys of the services (docs/anagrafiche.md, §7.2, §9, §10.1). Not designed in Figma: built from the
// models of the interface.

export function RegistrySettings() {
  return (
    <>
      <PeoplePanel />
      <RoleSyncPanel />
      <TokensPanel />
    </>
  );
}

function PeoplePanel() {
  const act = useAction();
  const settings = useQuery({ queryKey: ["registry-settings"], queryFn: registry.settings });
  const tables = useQuery({ queryKey: ["registry-tables"], queryFn: registry.tables });
  const [tableId, setTableId] = useState<number | null | undefined>(undefined);
  const chosen = tableId === undefined ? (settings.data?.peopleTableId ?? null) : tableId;
  const table = useQuery({ queryKey: ["registry-table", chosen], queryFn: () => registry.table(chosen!), enabled: chosen !== null });
  const [emailId, setEmailId] = useState<number | null | undefined>(undefined);
  const email = emailId === undefined ? (settings.data?.emailFieldId ?? null) : emailId;
  if (!settings.data) return <Loading />;
  return (
    <Panel title="The people of the registry">
      <p className="muted">The table of the people, and the field with the email they sign in with: the registry then knows who is looking, its views can be groups, and the roles of the ERP can come from it.</p>
      <div className="inline-form">
        <Field label="Table of the people" htmlFor="people-table">
          <select id="people-table" className="input small" value={chosen ?? ""} onChange={(e) => { setTableId(e.target.value === "" ? null : Number(e.target.value)); setEmailId(null); }}>
            <option value="">None</option>
            {(tables.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <Field label="Their sign-in email" htmlFor="people-email">
          <select id="people-email" className="input small" value={email ?? ""} onChange={(e) => setEmailId(e.target.value === "" ? null : Number(e.target.value))}>
            <option value="">Choose…</option>
            {(table.data?.fields ?? []).filter((f) => ["email", "text", "formula", "lookup"].includes(f.type)).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </Field>
        <Button small onClick={() => act(() => registry.setSettings({ peopleTableId: chosen, emailFieldId: email }))}>Save</Button>
      </div>
      {settings.data.groups.length > 0 && <p className="hint">Groups: {settings.data.groups.map((g) => g.name).join(", ")}</p>}
    </Panel>
  );
}

const ROLE_FIELDS: { key: keyof RoleSync; label: string }[] = [
  { key: "activeViewId", label: "May sign in" },
  { key: "adminViewId", label: "Admin" },
  { key: "pmViewId", label: "User, with the areas below" },
  { key: "treasuryViewId", label: "Treasury box" },
  { key: "sponsorsViewId", label: "Sponsors box" },
];

function RoleSyncPanel() {
  const act = useAction();
  const sync = useQuery({ queryKey: ["role-sync"], queryFn: registry.roleSync });
  const areas = useQuery({ queryKey: ["areas"], queryFn: api.areas });
  const [draft, setDraft] = useState<Partial<RoleSync>>({});
  const [preview, setPreview] = useState<{ changes: RoleChange[]; warnings: string[] } | null>(null);
  if (!sync.data) return <Loading />;
  const value = <K extends keyof RoleSync>(k: K) => (k in draft ? draft[k] : sync.data![k]) as RoleSync[K];
  const choices = Object.fromEntries(ROLE_FIELDS.map((r) => [r.key, value(r.key)]).concat([["pmAreasFieldId", value("pmAreasFieldId")]]));
  const areaName = (id: unknown) => areas.data?.find((a) => a.id === id)?.name ?? String(id);
  const show = (key: string, v: unknown) => (Array.isArray(v) ? (key === "areaIds" ? v.map(areaName) : v).join(", ") || "none" : v === null ? "—" : String(v));
  return (
    <Panel title="The roles of the ERP from the registry">
      <p className="muted">
        Each permission of the ERP from a group of the people table. Turned on, every change of the registry changes the accounts at once (and the Users page shows them read-only); the emails of ADMIN_EMAILS stay admins. People not in the registry stay as they are.
      </p>
      {sync.data.peopleTableId === null ? (
        <p className="hint warning">Choose the table of the people first.</p>
      ) : (
        <div className="stack tight">
          <div className="form-grid">
            {ROLE_FIELDS.map((r) => (
              <Field key={r.key} label={r.label} htmlFor={`sync-${r.key}`}>
                <select id={`sync-${r.key}`} className="input small" value={(value(r.key) as number | null) ?? ""} onChange={(e) => setDraft({ ...draft, [r.key]: e.target.value === "" ? null : Number(e.target.value) })}>
                  <option value="">Nobody</option>
                  {sync.data!.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </Field>
            ))}
            <Field label="Areas of a User (codes: SW, HW…)" htmlFor="sync-areas">
              <select id="sync-areas" className="input small" value={value("pmAreasFieldId") ?? ""} onChange={(e) => setDraft({ ...draft, pmAreasFieldId: e.target.value === "" ? null : Number(e.target.value) })}>
                <option value="">None</option>
                {sync.data.fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </Field>
          </div>
          <div className="inline-form">
            <Button small variant="ghost" onClick={() => act(async () => setPreview(await registry.previewRoleSync(choices)))}>Preview</Button>
            {value("enabled") ? (
              <>
                <Button small onClick={() => act(() => registry.setRoleSync(choices))}>Save</Button>
                <Button small variant="ghost" onClick={() => act(() => registry.setRoleSync({ ...choices, enabled: false }))}>Turn off</Button>
              </>
            ) : (
              <Button small onClick={() => window.confirm("Turn the link on? The accounts change now.") && act(() => registry.setRoleSync({ ...choices, enabled: true }))}>Turn on</Button>
            )}
            <span className={`pill ${value("enabled") ? "ok" : "teal"}`}>{value("enabled") ? "On" : "Off"}</span>
          </div>
          {preview && (
            <div className="stack tight">
              {preview.warnings.map((w, i) => <p key={i} className="hint warning">{w}</p>)}
              {preview.changes.length === 0 ? (
                <p className="hint">Nothing would change.</p>
              ) : (
                <table className="data-table">
                  <thead><tr><th>PERSON</th><th>WHAT CHANGES</th></tr></thead>
                  <tbody>
                    {preview.changes.map((c) => (
                      <tr key={c.email}>
                        <td>{c.name}<div className="hint">{c.email}{c.create ? " · new account" : ""}</div></td>
                        <td>{Object.entries(c.changes).map(([k, v]) => <div key={k}>{k === "areaIds" ? "areas" : k}: {show(k, v.from)} → {show(k, v.to)}</div>)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function TokensPanel() {
  const act = useAction();
  const tokens = useQuery({ queryKey: ["tokens"], queryFn: registry.tokens });
  const users = useQuery({ queryKey: ["users"], queryFn: api.users });
  const [name, setName] = useState("");
  const [userId, setUserId] = useState("");
  const [made, setMade] = useState<string | null>(null);
  const [serviceEmail, setServiceEmail] = useState("");
  return (
    <>
      <Panel title="API tokens">
        <p className="muted">A key for a service (n8n, the bot, the website): sent as Authorization: Bearer &lt;key&gt;, it acts as the user chosen, with that user's permissions. Shown once only.</p>
        {made && (
          <p className="hint warning mono">
            {made} <IconButton icon={faCopy} label="Copy the key" onClick={() => navigator.clipboard.writeText(made)} /> Copy it now: it will not be shown again.
          </p>
        )}
        <table className="data-table">
          <thead><tr><th>NAME</th><th>ACTS AS</th><th>MADE</th><th /></tr></thead>
          <tbody>
            {(tokens.data ?? []).map((t) => (
              <tr key={t.id} className={t.revokedAt ? "muted" : undefined}>
                <td>{t.name}</td>
                <td>{t.userName} <span className="hint">{t.userEmail}</span></td>
                <td>{t.createdAt.slice(0, 10)}{t.createdBy ? ` · ${t.createdBy}` : ""}{t.revokedAt ? ` · revoked ${t.revokedAt.slice(0, 10)}` : ""}</td>
                <td className="num">{!t.revokedAt && <IconButton icon={faTrash} label={`Revoke ${t.name}`} danger onClick={() => window.confirm(`Revoke ${t.name}? It stops working at once.`) && act(() => registry.revokeToken(t.id))} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <FormPanel title="New token" submitLabel="Make the key" canSubmit={name.trim() !== "" && userId !== ""} onSubmit={async () => { await act(async () => { setMade((await registry.createToken(name.trim(), Number(userId))).token); setName(""); }); }} onCancel={() => setName("")}>
        <Field label="Name" htmlFor="token-name"><input id="token-name" className="input small" placeholder="n8n" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Acts as" htmlFor="token-user">
          <select id="token-user" className="input small" value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Choose…</option>
            {(users.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
          </select>
        </Field>
      </FormPanel>
      <FormPanel title="New account for a service" description="An account nobody signs in with, for a token (a viewer: give it the rules it needs in the registry)." submitLabel="Add the account" canSubmit={/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(serviceEmail)} onSubmit={async () => { if (await act(() => api.createUser({ email: serviceEmail, name: serviceEmail.split("@")[0]!, role: "viewer" }))) setServiceEmail(""); }} onCancel={() => setServiceEmail("")}>
        <Field label="Email" htmlFor="service-email"><input id="service-email" className="input small" placeholder="n8n@service.eagletrt.it" value={serviceEmail} onChange={(e) => setServiceEmail(e.target.value)} /></Field>
      </FormPanel>
    </>
  );
}
