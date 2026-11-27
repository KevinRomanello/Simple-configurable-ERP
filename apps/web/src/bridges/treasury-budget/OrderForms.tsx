import { useState } from "react";
import { treasuryBudgetApi } from "./api";
import type { PurchaseOrder, ToPayRow } from "./types";
import { DraftNote } from "../../core/DraftNote";
import { SearchSelect } from "../../core/SearchSelect";
import { Field, FormPanel } from "../../core/ui";
import { date } from "../../core/format";
import { useAction } from "../../core/useAction";
import { useDraft } from "../../core/useDraft";

// The orders of TO PAY (docs/registro-di-cassa.md, §5.4bis): the ticked lines grouped into a new order, or added to one already there.

const distinct = (values: (string | null)[]) => [...new Set(values.filter((v): v is string => v !== null))];

/** What the form says about the lines before they are grouped: those that leave another order, and suppliers that do not agree. */
function Notes({ rows, into }: { rows: ToPayRow[]; into?: number }) {
  const moving = rows.filter((r) => r.orderId !== null && r.orderId !== into);
  const suppliers = distinct(rows.map((r) => r.supplierName));
  return (
    <>
      {moving.length > 0 && (
        <p className="hint">
          {moving.length === 1 ? "One line is" : `${moving.length} lines are`} in another order already ({distinct(moving.map((r) => r.orderName)).join(", ")}): {moving.length === 1 ? "it moves" : "they move"} to this one.
        </p>
      )}
      {suppliers.length > 1 && <p className="hint">The lines were bought from different suppliers ({suppliers.join(", ")}): check that they are one order.</p>}
    </>
  );
}

/** «Group as one order»: a name for the ticked lines, by default the supplier and the day of the first one. */
export function NewOrder({ rows, onDone }: { rows: ToPayRow[]; onDone: () => void }) {
  const act = useAction();
  const first = rows[0]!;
  const [initial] = useState(() => ({ name: [first.supplierName, date(first.purchaseDate)].filter(Boolean).join(" ") }));
  const [form, setForm, saved] = useDraft("order:new", initial);
  const submit = async () => {
    if (await act(() => treasuryBudgetApi.createOrder({ name: form.name.trim(), lineIds: rows.map((r) => r.lineId) }))) {
      saved.discard();
      onDone();
    }
  };
  return (
    <FormPanel
      title={`Group ${rows.length} lines as one order`}
      description="Lines bought together: one order, one invoice, one payment. The order is one row of TO PAY, and opens to show its lines."
      submitLabel="Group"
      canSubmit={form.name.trim() !== ""}
      onSubmit={submit}
      onCancel={() => saved.leave(onDone)}
      layout="stack"
    >
      <DraftNote draft={saved} />
      <Field label="Name of the order" htmlFor="order-name">
        <input id="order-name" className="input small wide" maxLength={100} value={form.name} onChange={(e) => setForm({ name: e.target.value })} />
      </Field>
      <Notes rows={rows} />
    </FormPanel>
  );
}

/** «Add to order…»: the ticked lines join an order of their season (a user adds their lines to an order of several areas). */
export function AddToOrder({ rows, orders, onDone }: { rows: ToPayRow[]; orders: PurchaseOrder[]; onDone: () => void }) {
  const act = useAction();
  const [form, setForm, saved] = useDraft("order:add", { orderId: "" });
  const into = form.orderId === "" ? undefined : Number(form.orderId);
  const submit = async () => {
    if (into !== undefined && (await act(() => treasuryBudgetApi.updateOrder(into, { addLineIds: rows.map((r) => r.lineId) })))) {
      saved.discard();
      onDone();
    }
  };
  return (
    <FormPanel
      title={`Add ${rows.length === 1 ? "one line" : `${rows.length} lines`} to an order`}
      submitLabel="Add"
      canSubmit={into !== undefined}
      onSubmit={submit}
      onCancel={() => saved.leave(onDone)}
      layout="stack"
    >
      <DraftNote draft={saved} />
      <Field label="Order" htmlFor="order-into">
        <SearchSelect id="order-into" value={form.orderId} onChange={(orderId) => setForm({ orderId })} choices={[{ value: "", label: "—" }, ...orders.map((o) => ({ value: String(o.id), label: o.name }))]} />
      </Field>
      <Notes rows={rows} into={into} />
    </FormPanel>
  );
}
