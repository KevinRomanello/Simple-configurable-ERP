import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { CashListItem, CashScope, CategoryDefault } from "../api/types";
import { CommitInput } from "../components/CommitInput";
import { DeleteButton, OrderButtons } from "../components/ListButtons";
import { QuickAdd, usedBy } from "../components/QuickAdd";
import { DataTable, Panel, type Column } from "../components/ui";
import { useAction } from "../lib/useAction";

// Settings: the two lists of the register of the team's money, kept by the treasury and the admins.
// Not designed in Figma: the lists of Settings. docs/registro-di-cassa.md

const CASH_SCOPES: { value: CashScope; label: string }[] = [
  { value: "project", label: "On a project" },
  { value: "outside", label: "Outside the budget" },
  { value: "ignore", label: "Ignored" },
];

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
    {
      key: "scope",
      header: "COUNTS",
      cell: (v) => (
        <select className="input small" aria-label={`${v.name}: where it counts`} value={v.scope ?? "project"} onChange={(e) => act(() => api.updateCashCategory(v.id, { scope: e.target.value as CashScope }))}>
          {CASH_SCOPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
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
      <p className="muted">
        <strong>Counts</strong> says where the money of a Voce goes in the budget. <em>On a project</em>: it is spent on a budget line, so it counts through the
        line it is tied to (TO PAY lists the payments still to tie). <em>Outside the budget</em>: a stamp duty, a membership fee, an insurance: it counts in the
        area ADMINISTRATION, in TOTAL, the Gantt and the analyses, as if it were a project. <em>Ignored</em>: the budget already counts it (sponsorship, VAT).
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

/** For each category of the budget, the Voce a payment for one of its lines starts from (TO PAY); the treasury changes it when paying. */
function CategoryVoci() {
  const act = useAction();
  const defaults = useQuery({ queryKey: ["category-defaults"], queryFn: api.categoryDefaults });
  const voci = useQuery({ queryKey: ["cash-categories"], queryFn: api.cashCategories });
  const columns: Column<CategoryDefault>[] = [
    { key: "category", header: "BUDGET CATEGORY", cell: (c) => c.name },
    {
      key: "voce",
      header: "VOCE OF THE PAYMENT",
      cell: (c) => (
        <select className="input small" aria-label={`Voce for ${c.name}`} value={c.voceId ?? ""} onChange={(e) => act(() => api.setCategoryDefault(c.categoryId, e.target.value === "" ? null : Number(e.target.value)))}>
          <option value="">— (chosen when paying)</option>
          {(voci.data ?? []).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      ),
    },
  ];
  return (
    <Panel title="Register: Voce of a payment, by budget category">
      <p className="muted">
        When a line of the budget is paid from TO PAY, the payment starts from the Voce of the category of the line (Asset → 1.1 Attrezzature, for example).
        It can always be changed in the form of the payment.
      </p>
      <DataTable title="Voce by budget category" columns={columns} rows={defaults.data} rowKey={(c) => c.categoryId} empty="No categories" />
    </Panel>
  );
}

export function CashListsPanel() {
  return (
    <>
      <Voci />
      <Methods />
      <CategoryVoci />
    </>
  );
}
