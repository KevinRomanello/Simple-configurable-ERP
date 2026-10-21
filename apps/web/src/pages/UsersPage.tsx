import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Role, UserRow } from "../api/types";
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

  if (!allowed) return <p className="empty">Only an admin can manage users.</p>;

  const change = (user: UserRow, body: Parameters<typeof api.updateUser>[1]) => act(() => api.updateUser(user.id, body));
  const toggleArea = (user: UserRow, areaId: number, on: boolean) =>
    change(user, { areaIds: on ? [...user.areaIds, areaId] : user.areaIds.filter((id) => id !== areaId) });

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Users</h1>
          <p className="muted">
            People appear here after their first sign-in, as viewers. A deactivated person cannot use the app
            from their next request on.
          </p>
        </div>
      </header>

      <section className="panel">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>NAME</th><th>EMAIL</th><th>ROLE</th><th>AREAS (PM)</th><th>ACTIVE</th></tr>
            </thead>
            <tbody>
              {users.data?.map((user) => (
                <tr key={user.id} className={user.active ? undefined : "inactive"}>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td>
                    <select
                      className="input small"
                      value={user.role}
                      aria-label={`Role of ${user.name}`}
                      onChange={(e) => change(user, { role: e.target.value as Role })}
                    >
                      {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </td>
                  <td>
                    {user.role === "pm" ? (
                      <div className="area-boxes">
                        {areas.data?.map((area) => (
                          <label key={area.id} className="checkbox">
                            <input
                              type="checkbox"
                              checked={user.areaIds.includes(area.id)}
                              onChange={(e) => toggleArea(user, area.id, e.target.checked)}
                            />
                            {area.name}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={user.active}
                        aria-label={`${user.name} is active`}
                        onChange={(e) => change(user, { active: e.target.checked })}
                      />
                      {user.active ? "yes" : "no"}
                    </label>
                  </td>
                </tr>
              ))}
              {users.data?.length === 0 && <tr><td colSpan={5} className="empty">Nobody yet</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
