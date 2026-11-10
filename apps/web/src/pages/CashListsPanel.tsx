import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { CashListItem } from "../api/types";
import { CommitInput } from "../components/CommitInput";
import { DeleteButton, OrderButtons } from "../components/ListButtons";
import { QuickAdd, usedBy } from "../components/QuickAdd";
import { DataTable, Panel, type Column } from "../components/ui";
import { useAction } from "../lib/useAction";

// Settings: the two lists of the register of the team's money, kept by the treasury and the admins.
// Not designed in Figma: the lists of Settings. docs/registro-di-cassa.md

function Voci() {
  const act = useAction();
  const voci = useQuery({ queryKey: ["cash-categories"], queryFn: api.cashCategories });
  const ids = (voci.data ?? []).map((v) => v.id);
  const columns: Column<CashListItem>[] = [
    { key: "name", header: "VOCE", cell: (v) => <CommitInput wide value={v.name} label={`Name of ${v.name}`} onCommit={(name) => name !== "" && act(() => api.updateCashCategory(v.id, { name }))} /> },
    {
      key: "sponsorship",
      header: "SPONSORSHIP BY DEFAULT",
      cell: (v) => (
        <input type="checkbox" aria-label={`${v.name}: sponsorship by default`} checked={v.sponsorship === true} onChange={(e) => act(() => api.updateCashCategory(v.id, { sponsorship: e.target.checked }))} />
      ),
    },
    usedBy<CashListItem>(),
    { key: "order", header: "ORDER", cell: (v) => <OrderButtons ids={ids} index={ids.indexOf(v.id)} label={v.name} onOrder={(order) => act(() => api.orderCashCategories(order))} /> },
    { key: "delete", header: "", num: true, cell: (v) => <DeleteButton label={v.name} usedBy={v.usedBy} onDelete={() => act(() => api.deleteCashCategory(v.id))} /> },
  ];
  return (
    <Panel title="Register: Voci">
      <p className="muted">
        The Voce of a movement, as in the sheet of the treasury. Money in on a Voce with the box ticked starts as sponsorship (it owes 11% VAT,
        like an inflow of CASH FLOW): the box of the movement itself stays the one to decide. Renaming a Voce renames it on every movement.
      </p>
      <DataTable title="Voci" columns={columns} rows={voci.data} rowKey={(v) => v.id} empty="No Voci" />
      <QuickAdd id="new-voce" noun="Voce" label="Name" onAdd={(name) => act(() => api.createCashCategory({ name }))} />
    </Panel>
  );
}

function Methods() {
  const act = useAction();
  const methods = useQuery({ queryKey: ["cash-methods"], queryFn: api.cashMethods });
  const ids = (methods.data ?? []).map((m) => m.id);
  const columns: Column<CashListItem>[] = [
    { key: "name", header: "PAYMENT METHOD", cell: (m) => <CommitInput value={m.name} label={`Name of ${m.name}`} onCommit={(name) => name !== "" && act(() => api.renameCashMethod(m.id, name))} /> },
    usedBy<CashListItem>(),
    { key: "order", header: "ORDER", cell: (m) => <OrderButtons ids={ids} index={ids.indexOf(m.id)} label={m.name} onOrder={(order) => act(() => api.orderCashMethods(order))} /> },
    { key: "delete", header: "", num: true, cell: (m) => <DeleteButton label={m.name} usedBy={m.usedBy} onDelete={() => act(() => api.deleteCashMethod(m.id))} /> },
  ];
  return (
    <Panel title="Register: payment methods">
      <p className="muted">How a payment was made (bonifico, visa, Paypal…). It is not the account: a payment with Paypal can leave the bank account.</p>
      <DataTable title="Payment methods" columns={columns} rows={methods.data} rowKey={(m) => m.id} empty="No methods" />
      <QuickAdd id="new-method" noun="method" label="Name" onAdd={(name) => act(() => api.createCashMethod(name))} />
    </Panel>
  );
}

export function CashListsPanel() {
  return (
    <>
      <Voci />
      <Methods />
    </>
  );
}
