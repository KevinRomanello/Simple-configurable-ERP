import { useQuery } from "@tanstack/react-query";
import { treasuryApi } from "./api";
import type { CashListItem } from "./types";
import type { CashScope } from "../../core/calcTypes";
import { CommitInput } from "../../core/CommitInput";
import { DeleteButton } from "../../core/ListButtons";
import { QuickAdd, usedBy } from "../../core/QuickAdd";
import { DataTable, Panel, type Column } from "../../core/ui";
import { useAction } from "../../core/useAction";
import { Slot } from "../../core/slots";
import { registerSettings } from "./slots";

// Settings: the two lists of the register of the team's money, kept by the treasury and the admins.
// Not designed in Figma: the lists of Settings. docs/registro-di-cassa.md

const CASH_SCOPES: { value: CashScope; label: string }[] = [
  { value: "project", label: "On a project" },
  { value: "outside", label: "Outside the budget" },
  { value: "ignore", label: "Ignored" },
];

function Voci() {
  const act = useAction();
  const voci = useQuery({ queryKey: ["cash-categories"], queryFn: treasuryApi.cashCategories });
  const columns: Column<CashListItem>[] = [
    { key: "name", header: "VOCE", cell: (v) => <CommitInput wide value={v.name} label={`Name of ${v.name}`} onCommit={(name) => name !== "" && act(() => treasuryApi.updateCashCategory(v.id, { name }))} /> },
    {
      key: "sponsorship",
      header: "SPONSORSHIP BY DEFAULT",
      cell: (v) => (
        <input type="checkbox" aria-label={`${v.name}: sponsorship by default`} checked={v.sponsorship === true} onChange={(e) => act(() => treasuryApi.updateCashCategory(v.id, { sponsorship: e.target.checked }))} />
      ),
    },
    {
      key: "scope",
      header: "COUNTS",
      cell: (v) => (
        <select className="input small" aria-label={`${v.name}: where it counts`} value={v.scope ?? "project"} onChange={(e) => act(() => treasuryApi.updateCashCategory(v.id, { scope: e.target.value as CashScope }))}>
          {CASH_SCOPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      ),
    },
    usedBy<CashListItem>(),
    { key: "delete", header: "", num: true, cell: (v) => <DeleteButton label={v.name} usedBy={v.usedBy} onDelete={() => act(() => treasuryApi.deleteCashCategory(v.id))} /> },
  ];
  return (
    <Panel title="Register: Voci">
      <p className="muted">
        The Voce of a movement, as in the sheet of the treasury. Money in on a Voce with the box ticked starts as sponsorship (it owes 11% VAT,
        like an inflow of CASH FLOW): the box of the movement itself stays the one to decide. Renaming a Voce renames it on every movement.
      </p>
      <p className="muted">
        <strong>Counts</strong> says where the money of a Voce goes in the budget. <em>On a project</em>: it is spent on a budget line, so it counts through the
        line it is tied to (TO PAY lists the payments still to tie). <em>Outside the budget</em>: a stamp duty, a membership fee, an insurance: it counts in the
        area ADMINISTRATION, in TOTAL, the Gantt and the analyses, as if it were a project. <em>Ignored</em>: the budget already counts it (sponsorship, VAT).
      </p>
      <DataTable title="Voci" columns={columns} rows={voci.data} rowKey={(v) => v.id} empty="No Voci" reorder={{ label: (v) => v.name, onOrder: (order) => act(() => treasuryApi.orderCashCategories(order)) }} />
      <QuickAdd id="new-voce" noun="Voce" label="Name" onAdd={(name) => act(() => treasuryApi.createCashCategory({ name }))} />
    </Panel>
  );
}

function Methods() {
  const act = useAction();
  const methods = useQuery({ queryKey: ["cash-methods"], queryFn: treasuryApi.cashMethods });
  const columns: Column<CashListItem>[] = [
    { key: "name", header: "PAYMENT METHOD", cell: (m) => <CommitInput value={m.name} label={`Name of ${m.name}`} onCommit={(name) => name !== "" && act(() => treasuryApi.renameCashMethod(m.id, name))} /> },
    usedBy<CashListItem>(),
    { key: "delete", header: "", num: true, cell: (m) => <DeleteButton label={m.name} usedBy={m.usedBy} onDelete={() => act(() => treasuryApi.deleteCashMethod(m.id))} /> },
  ];
  return (
    <Panel title="Register: payment methods">
      <p className="muted">How a payment was made (bonifico, visa, Paypal…). It is not the account: a payment with Paypal can leave the bank account.</p>
      <DataTable title="Payment methods" columns={columns} rows={methods.data} rowKey={(m) => m.id} empty="No methods" reorder={{ label: (m) => m.name, onOrder: (order) => act(() => treasuryApi.orderCashMethods(order)) }} />
      <QuickAdd id="new-method" noun="method" label="Name" onAdd={(name) => act(() => treasuryApi.createCashMethod(name))} />
    </Panel>
  );
}

export function CashListsPanel() {
  return (
    <>
      <Voci />
      <Methods />
      {/* what the others keep about the register here: the Voce of a payment by budget category (the bridge to the budget) */}
      <Slot slot={registerSettings} props={{}} />
    </>
  );
}
