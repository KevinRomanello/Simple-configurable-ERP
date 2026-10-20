import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api } from "../api/client";
import { Button, IconButton } from "../components/Button";
import { useMe } from "../lib/auth";
import { useAction } from "../lib/useAction";

/** BOUGHT FROM: the single list of suppliers used by the dropdowns of every area. */
export function SuppliersPage() {
  const act = useAction();
  const canManage = useMe().permissions.canManageSuppliers;
  const suppliers = useQuery({ queryKey: ["suppliers"], queryFn: api.suppliers });
  const [name, setName] = useState("");

  const add = async (event: FormEvent) => {
    event.preventDefault();
    if (await act(() => api.createSupplier(name.trim()))) setName("");
  };

  return (
    <>
      <header className="page-header">
        <div>
          <h1>BOUGHT FROM</h1>
          <p className="muted">One list of suppliers. A supplier that budget lines use cannot be deleted.</p>
        </div>
        {canManage && (
          <form className="inline-form" onSubmit={add}>
            <div className="field">
              <label htmlFor="supplier-name">New supplier</label>
              <input id="supplier-name" className="input small" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <Button small icon={faPlus} type="submit" disabled={name.trim() === ""}>Add supplier</Button>
          </form>
        )}
      </header>

      <div className="table-wrap" style={{ maxWidth: 480 }}>
        <table className="data-table">
          <thead>
            <tr><th>SUPPLIER</th><th /></tr>
          </thead>
          <tbody>
            {suppliers.data?.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td className="num">
                  {canManage && <IconButton icon={faTrash} label={`Delete ${s.name}`} danger onClick={() => act(() => api.deleteSupplier(s.id))} />}
                </td>
              </tr>
            ))}
            {suppliers.data?.length === 0 && <tr><td colSpan={2} className="empty">No suppliers yet</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
