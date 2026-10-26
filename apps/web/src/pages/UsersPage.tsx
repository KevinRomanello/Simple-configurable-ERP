import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Role, UserRow } from "../api/types";
import { DataTable, Message, PageHeader, Panel, type Column } from "../components/ui";
import { useMe } from "../lib/auth";
import { useAction } from "../lib/useAction";

const ROLES: { value: Role; label: string }[] = [
  { value: "viewer", label: "viewer: looks only" },
  { value: "pm", label: "pm: changes their areas" },
  { value: "admin", label: "admin: everything" },
];

/**
 * Who can sign in and what they may do. People appear here after their first sign-in, as viewers;
 * an admin makes them pm (and picks their areas) or admin. Not designed in Figma yet.
 */
export function UsersPage() {
  const act = useAction();
  const me = useMe();
  const allowed = me.permissions.canManageUsers;
  const users = useQuery({ queryKey: ["users"], queryFn: api.users, enabled: allowed });
  const areas = useQuery({ queryKey: ["areas"], queryFn: api.areas });

  if (!allowed) return <Message>Only an admin can manage users.</Message>;

  const change = (user: UserRow, body: Parameters<typeof api.updateUser>[1]) => act(() => api.updateUser(user.id, body));
  const toggleArea = (user: UserRow, areaId: number, on: boolean) =>
    change(user, { areaIds: on ? [...user.areaIds, areaId] : user.areaIds.filter((id) => id !== areaId) });

  const columns: Column<UserRow>[] = [
    { key: "name", header: "NAME", cell: (u) => u.name, sort: (u) => u.name },
    { key: "email", header: "EMAIL", cell: (u) => u.email, sort: (u) => u.email },
    {
      key: "role",
      header: "ROLE",
      sort: (u) => u.role,
      cell: (u) => (
        <select className="input small" value={u.role} aria-label={`Role of ${u.name}`} onChange={(e) => change(u, { role: e.target.value as Role })}>
          {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      ),
    },
    {
      key: "areas",
      header: "AREAS (PM)",
      cell: (u) =>
        u.role === "pm" ? (
          <div className="area-boxes">
            {areas.data?.map((area) => (
              <label key={area.id} className="checkbox">
                <input type="checkbox" checked={u.areaIds.includes(area.id)} onChange={(e) => toggleArea(u, area.id, e.target.checked)} />
                {area.name}
              </label>
            ))}
          </div>
        ) : (
          <span className="muted">—</span>
        ),
    },
    {
      key: "active",
      header: "ACTIVE",
      sort: (u) => (u.active ? 1 : 0),
      cell: (u) => (
        <label className="checkbox">
          <input type="checkbox" checked={u.active} aria-label={`${u.name} is active`} onChange={(e) => change(u, { active: e.target.checked })} />
          {u.active ? "yes" : "no"}
        </label>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Users"
        description="People appear here after their first sign-in, as viewers. A deactivated person cannot use the app from their next request on."
      />
      <Panel>
        <DataTable
          title="Users"
          columns={columns}
          rows={users.data}
          rowKey={(u) => u.id}
          rowClass={(u) => (u.active ? undefined : "inactive")}
          empty="Nobody yet"
        />
      </Panel>
    </>
  );
}
