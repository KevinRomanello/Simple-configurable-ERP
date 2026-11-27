import { faCopy, faTrash } from "@fortawesome/free-solid-svg-icons";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { platformApi } from "./api";
import { IconButton } from "../core/Button";
import { DraftNote } from "../core/DraftNote";
import { Field, FormPanel, Panel, Table, TableScroll } from "../core/ui";
import { useAction } from "../core/useAction";
import { fieldSetter, useDraft } from "../core/useDraft";

// The keys of the services (n8n, the bot, the website) and the accounts they act as: they reach the whole ERP, not only the
// registry, so they live in Settings › App (admins) and stay there when the Registry module is turned off (docs/moduli.md).

export function TokensPanel() {
  const act = useAction();
  const tokens = useQuery({ queryKey: ["tokens"], queryFn: platformApi.tokens });
  const users = useQuery({ queryKey: ["users"], queryFn: platformApi.users });
  // the token is shown once and is never kept: only what is written in the two forms is
  const [token, setToken, savedToken] = useDraft("new-token", { name: "", userId: "" });
  const [serviceEmail, setServiceEmail, savedAccount] = useDraft("new-service-account", "");
  const { name, userId } = token;
  const setField = fieldSetter(setToken);
  const [made, setMade] = useState<string | null>(null);
  return (
    <>
      <Panel title="API tokens">
        <p className="muted">A key for a service (n8n, the bot, the website): sent as Authorization: Bearer &lt;key&gt;, it acts as the user chosen, with that user's permissions. Shown once only.</p>
        {made && (
          <p className="hint warning mono">
            {made} <IconButton icon={faCopy} label="Copy the key" onClick={() => navigator.clipboard.writeText(made)} /> Copy it now: it will not be shown again.
          </p>
        )}
        <TableScroll>
          <Table>
            <thead><tr><th>NAME</th><th>ACTS AS</th><th>MADE</th><th /></tr></thead>
            <tbody>
              {(tokens.data ?? []).map((t) => (
                <tr key={t.id} className={t.revokedAt ? "muted" : undefined}>
                  <td>{t.name}</td>
                  <td>{t.userName} <span className="hint">{t.userEmail}</span></td>
                  <td>{t.createdAt.slice(0, 10)}{t.createdBy ? ` · ${t.createdBy}` : ""}{t.revokedAt ? ` · revoked ${t.revokedAt.slice(0, 10)}` : ""}</td>
                  <td className="num">{!t.revokedAt && <IconButton icon={faTrash} label={`Revoke ${t.name}`} danger onClick={() => window.confirm(`Revoke ${t.name}? It stops working at once.`) && act(() => platformApi.revokeToken(t.id))} />}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableScroll>
      </Panel>
      <FormPanel title="New token" submitLabel="Make the key" canSubmit={name.trim() !== "" && userId !== ""} onSubmit={async () => { await act(async () => { setMade((await platformApi.createToken(name.trim(), Number(userId))).token); savedToken.discard(); }); }} onCancel={() => savedToken.leave(() => {})}>
        <DraftNote draft={savedToken} />
        <Field label="Name" htmlFor="token-name"><input id="token-name" className="input small" placeholder="n8n" value={name} onChange={(e) => setField("name")(e.target.value)} /></Field>
        <Field label="Acts as" htmlFor="token-user">
          <select id="token-user" className="input small" value={userId} onChange={(e) => setField("userId")(e.target.value)}>
            <option value="">Choose…</option>
            {(users.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
          </select>
        </Field>
      </FormPanel>
      <FormPanel title="New account for a service" description="An account nobody signs in with, for a token (a viewer: give it the rules it needs in the registry)." submitLabel="Add the account" canSubmit={/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(serviceEmail)} onSubmit={async () => { if (await act(() => platformApi.createUser({ email: serviceEmail, name: serviceEmail.split("@")[0]!, role: "viewer" }))) savedAccount.discard(); }} onCancel={() => savedAccount.leave(() => {})}>
        <DraftNote draft={savedAccount} />
        <Field label="Email" htmlFor="service-email"><input id="service-email" className="input small" placeholder="n8n@service.eagletrt.it" value={serviceEmail} onChange={(e) => setServiceEmail(e.target.value)} /></Field>
      </FormPanel>
    </>
  );
}
