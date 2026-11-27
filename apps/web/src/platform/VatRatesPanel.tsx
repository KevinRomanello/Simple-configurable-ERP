import { platformApi } from "./api";
import type { SettingsView } from "./types";
import { DeleteButton } from "../core/ListButtons";
import { QuickAdd, usedBy } from "../core/QuickAdd";
import { DataTable, Panel, type Column } from "../core/ui";
import { useAction } from "../core/useAction";

/** The VAT rates, a list of the core: shown in the Budget section of Settings. */
export function VatRatesPanel({ rates }: { rates: SettingsView["vatRates"] }) {
  const act = useAction();
  const columns: Column<SettingsView["vatRates"][number]>[] = [
    { key: "rate", header: "VAT RATE", num: true, sort: (r) => r.rate, cell: (r) => `${r.rate}%` },
    usedBy(),
    { key: "delete", header: "", num: true, cell: (r) => <DeleteButton label={`${r.rate}%`} usedBy={r.usedBy} onDelete={() => act(() => platformApi.deleteVatRate(r.id))} /> },
  ];
  return (
    <Panel title="VAT rates">
      <p className="muted">The rates a line, a sponsor or an arrival can use. Used by: sponsors and budget lines.</p>
      <DataTable title="VAT rates" columns={columns} rows={rates} rowKey={(r) => r.id} empty="No rates" />
      <QuickAdd id="new-vat-rate" noun="VAT rate" label="Rate (%)" type="number" onAdd={(rate) => act(() => platformApi.createVatRate(Number(rate)))} />
    </Panel>
  );
}
