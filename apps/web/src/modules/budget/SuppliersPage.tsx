import { faTrash } from "@fortawesome/free-solid-svg-icons";
import { useQuery } from "@tanstack/react-query";
import { budgetApi } from "./api";
import type { Supplier } from "./types";
import { IconButton } from "../../core/Button";
import { DraftNote } from "../../core/DraftNote";
import { DataTable, Field, FormPanel, PageHeader, Panel, type Column } from "../../core/ui";
import { useMe } from "../../platform/auth";
import { useAction } from "../../core/useAction";
import { useDraft } from "../../core/useDraft";

/** BOUGHT FROM: the single list of suppliers used by the dropdowns of every area. */
export function SuppliersPage() {
  const act = useAction();
  const canManage = useMe().permissions.canManageSuppliers;
  const suppliers = useQuery({ queryKey: ["suppliers"], queryFn: budgetApi.suppliers });

  const columns: Column<Supplier>[] = [
    { key: "name", header: "SUPPLIER", cell: (s) => s.name, sort: (s) => s.name },
    {
      key: "delete",
      header: "",
      num: true,
      cell: (s) => canManage && <IconButton icon={faTrash} label={`Delete ${s.name}`} danger onClick={() => act(() => budgetApi.deleteSupplier(s.id))} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="BOUGHT FROM"
        description="One list of suppliers. A supplier that budget lines use cannot be deleted."
        add={canManage ? { label: "New supplier", draftKey: "new-supplier", form: (close) => <NewSupplier onDone={close} /> } : undefined}
      />
      <Panel>
        <DataTable title="Suppliers" columns={columns} rows={suppliers.data} rowKey={(s) => s.id} empty="No suppliers yet" />
      </Panel>
    </>
  );
}

function NewSupplier({ onDone }: { onDone: () => void }) {
  const act = useAction();
  const [name, setName, saved] = useDraft("new-supplier", "");
  const add = async () => {
    if (await act(() => budgetApi.createSupplier(name.trim()))) {
      saved.discard();
      onDone();
    }
  };
  return (
    <FormPanel title="New supplier" submitLabel="Add supplier" canSubmit={name.trim() !== ""} onSubmit={add} onCancel={() => saved.leave(onDone)}>
      <DraftNote draft={saved} />
      <Field label="Name" htmlFor="supplier-name">
        <input id="supplier-name" className="input small" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
      </Field>
    </FormPanel>
  );
}
