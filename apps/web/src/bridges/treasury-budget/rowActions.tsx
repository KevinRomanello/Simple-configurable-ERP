import { faCheck, faLink, faRotateLeft, faTrash } from "@fortawesome/free-solid-svg-icons";
import { treasuryBudgetApi } from "./api";
import { DeleteInflow } from "./DeleteInflow";
import { PayLines } from "./PayLines";
import { ReceiveInflow } from "./ReceiveInflow";
import type { Inflow } from "../../modules/budget/public";
import type { CashEntryRow } from "../../modules/treasury/public";
import { IconButton } from "../../core/Button";
import { date, moneyFromDecimal } from "../../core/format";
import type { RowActionFill } from "../../core/slots";
import { useAction } from "../../core/useAction";
import { useCanChangeInflows, useCanManageCash } from "../../platform/season";

// What the bridge between the treasury and the budget adds to the rows of their pages (the slots of docs/moduli-architettura.md, §7.4).

/** CASH FLOW: an expected inflow is received into the register, or is not any more. Receiving is the treasury's. */
export const receiveInflow: RowActionFill<Inflow> = {
  key: "receive",
  Buttons: function ReceiveButtons({ row, open }) {
    const act = useAction();
    const canEdit = useCanManageCash();
    // the expected side says whether the money arrived (the actual side is the register itself)
    if (!canEdit || row.phase !== "estimate" || row.source === "register") return null;
    return row.cashEntryId === null ? (
      <IconButton icon={faCheck} label="Mark as received" onClick={open} />
    ) : (
      <IconButton icon={faRotateLeft} label="Not received" onClick={() => act(() => treasuryBudgetApi.unreceiveInflow(row.id))} />
    );
  },
  eyebrow: "Mark as received",
  context: (i) => [["Contract value", moneyFromDecimal(i.amount)], ["Inflow date", date(i.inflowDate) || "—"]],
  draftKey: (id) => `receive-inflow:${id}`,
  Form: ({ row, onClose }) => <ReceiveInflow inflow={row} onClose={onClose} />,
  Quick: ({ row, onClose }) => <ReceiveInflow inflow={row} compact onClose={onClose} />,
};

/** CASH FLOW: deleting an inflow lists everything of its company, the movements of the register too, and the person ticks what goes. */
export const deleteInflow: RowActionFill<Inflow> = {
  key: "delete",
  Buttons: function DeleteButtons({ row, open }) {
    const canEdit = useCanManageCash();
    const canChange = useCanChangeInflows();
    // a movement of the register only the treasury deletes, from here too; the sponsors add and delete inflows, but not one already received
    const allowed = row.source === "register" ? canEdit : canChange && (canEdit || row.cashEntryId === null);
    return allowed ? <IconButton icon={faTrash} label="Delete inflow" danger onClick={open} /> : null;
  },
  eyebrow: "Delete",
  context: (i) => [["Row", moneyFromDecimal(i.amount)], ["Date", date(i.inflowDate) || "—"]],
  Form: ({ row, onClose }) => <DeleteInflow from={row.source === "register" ? { cashEntryId: row.id } : { inflowId: row.id }} onClose={onClose} />,
};

/** CASH REGISTER: a payment pays lines of the budget. */
export const linkToLines: RowActionFill<CashEntryRow> = {
  key: "link",
  Buttons: ({ row, open }) => (row.cents < 0 ? <IconButton icon={faLink} label="Link to budget lines" onClick={open} /> : null),
  eyebrow: "Link to budget lines",
  title: (e) => e.description || "this payment",
  draftKey: (id) => `pay-lines:${id}`,
  Form: ({ row, onClose }) => <PayLines entry={row} onClose={onClose} />,
};
