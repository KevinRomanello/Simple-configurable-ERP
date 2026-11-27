import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Role, UserRow } from "../api/types";
import { DataTable, Message, PageHeader, Panel, type Column } from "../components/ui";
import { useMe } from "../lib/auth";
import { useAction } from "../lib/useAction";

const ROLES: { value: Role; label: string }[] = [
  { value: "viewer", label: "viewer: looks only" },
  { value: "pm", label: "user: changes their areas" },
  { value: "admin", label: "admin: everything" },
];

/**
 * Who can sign in and what they may do. People appear here after their first sign-in, as viewers;
 * an admin makes them a user (the `pm` role: they pick their areas, and tick Treasury if they keep the
 * team's money and Sponsors if they keep the sponsors) or admin. Not designed in Figma yet.
 */
export function UsersPage() {
  const act = useAction();
  const me = useMe();
  const allowed = me.permissions.canManageUsers;
  const users = useQuery({ queryKey: ["users"], queryFn: api.users, enabled: allowed });
  const areas = useQuery({ queryKey: ["areas"], queryFn: api.areas });
  // the boxes the modules that are on offer: the page does not know which they are
  const boxes = useQuery({ queryKey: ["flags"], queryFn: api.flags, enabled: allowed });

  if (!allowed) return <Message>{me.readOnly ? "Editing is turned off on phones: use a computer to manage users." : "Only an admin can manage users."}</Message>;

  const change = (user: UserRow, body: Parameters<typeof api.updateUser>[1]) => act(() => api.updateUser(user.id, body));
  const toggleArea = (user: UserRow, areaId: number, on: boolean) =>
    change(user, { areaIds: on ? [...user.areaIds, areaId] : user.areaIds.filter((id) => id !== areaId) });

  const columns: Column<UserRow>[] = [
    {
      key: "name",
      header: "NAME",
      sort: (u) => u.name,
      // the role of a person in the registry comes from there (Settings › Registry), not from this page
      cell: (u) => <>{u.name}{u.managed && <span className="pill teal" title="Role, areas, boxes and Active come from the registry (Settings › Registry): change them there"> registry</span>}</>,
    },
    { key: "email", header: "EMAIL", cell: (u) => u.email, sort: (u) => u.email },
    {
      key: "role",
      header: "ROLE",
      sort: (u) => u.role,
      cell: (u) => (
        <select className="input small" value={u.role} disabled={u.managed} aria-label={`Role of ${u.name}`} onChange={(e) => change(u, { role: e.target.value as Role })}>
          {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      ),
    },
    {
      key: "areas",
      header: "AREAS AND BOXES (USER)",
      cell: (u) =>
        u.role === "pm" ? (
          <div className="area-boxes">
            {areas.data?.filter((area) => !area.derived).map((area) => (
              <label key={area.id} className="checkbox">
                <input type="checkbox" checked={u.areaIds.includes(area.id)} disabled={u.managed} onChange={(e) => toggleArea(u, area.id, e.target.checked)} />
                {area.name}
              </label>
            ))}
            {boxes.data?.filter((box) => box.roles.includes(u.role)).map((box) => (
              <label key={box.key} className="checkbox" title={box.explanation}>
                <input
                  type="checkbox"
                  checked={u.flags.includes(box.key)}
                  disabled={u.managed}
                  aria-label={`${u.name}: ${box.label}`}
                  onChange={(e) => change(u, { flags: e.target.checked ? [...u.flags, box.key] : u.flags.filter((key) => key !== box.key) })}
                />
                <strong>{box.label}</strong>
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
          <input type="checkbox" checked={u.active} disabled={u.managed} aria-label={`${u.name} is active`} onChange={(e) => change(u, { active: e.target.checked })} />
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
