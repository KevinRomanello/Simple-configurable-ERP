import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { Supplier } from "../api/types";
import { Button, IconButton } from "../components/Button";
import { useMe } from "../lib/auth";
import { useAction } from "../lib/useAction";
import { TableBox } from "../components/ExportBlocks";
import { DownloadMenu } from "../components/DownloadMenu";
import { SortTh } from "../components/SortTh";
import { useSort, type SortAccessors } from "../lib/sort";

const SORT: SortAccessors<Supplier> = { name: (s) => s.name };

/** BOUGHT FROM: the single list of suppliers used by the dropdowns of every area. */
export function SuppliersPage() {
  const act = useAction();
  const canManage = useMe().permissions.canManageSuppliers;
  const suppliers = useQuery({ queryKey: ["suppliers"], queryFn: api.suppliers });
  const sort = useSort(SORT);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);

  const add = async (event: FormEvent) => {
    event.preventDefault();
    if (await act(() => api.createSupplier(name.trim()))) {
      setName("");
      setAdding(false);
    }
  };

  return (
    <>
      <header className="page-header">
        <div>
          <h1>BOUGHT FROM</h1>
          <p className="muted">One list of suppliers. A supplier that budget lines use cannot be deleted.</p>
        </div>
        <div className="actions">
          {canManage && <Button icon={faPlus} onClick={() => setAdding(!adding)}>{adding ? "Close" : "New supplier"}</Button>}
          <DownloadMenu />
        </div>
      </header>

      {adding && (
        <section className="panel">
          <h2>New supplier</h2>
          <form className="inline-form" onSubmit={add}>
            <div className="field">
              <label htmlFor="supplier-name">Name</label>
              <input id="supplier-name" className="input small" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
            </div>
            <Button small icon={faPlus} type="submit" disabled={name.trim() === ""}>Add supplier</Button>
            <Button small variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </form>
        </section>
      )}

      <section className="panel">
        <TableBox title="Suppliers">
          <table className="data-table">
            <thead>
              <tr><SortTh sort={sort} by="name">SUPPLIER</SortTh><th /></tr>
            </thead>
            <tbody>
              {sort.sorted(suppliers.data ?? []).map((s) => (
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
        </TableBox>
      </section>
    </>
  );
}
