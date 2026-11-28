import { useQuery } from "@tanstack/react-query";
import { treasuryBudgetApi } from "./api";
import type { CategoryDefault } from "./types";
import { registerLists } from "../../modules/treasury/public";
import { DataTable, Panel, type Column } from "../../core/ui";
import { useAction } from "../../core/useAction";

// In Settings › Register (the slot `treasury.settings.panels`): it needs the categories of the budget and the Voci of the register.

/** For each category of the budget, the Voce a payment for one of its lines starts from (TO PAY); the treasury changes it when paying. */
export function CategoryVoci() {
  const act = useAction();
  const defaults = useQuery({ queryKey: ["category-defaults"], queryFn: treasuryBudgetApi.categoryDefaults });
  const voci = useQuery({ queryKey: ["cash-categories"], queryFn: registerLists.voci });
  const columns: Column<CategoryDefault>[] = [
    { key: "category", header: "BUDGET CATEGORY", cell: (c) => c.name },
    {
      key: "voce",
      header: "VOCE OF THE PAYMENT",
      cell: (c) => (
        <select className="input small" aria-label={`Voce for ${c.name}`} value={c.voceId ?? ""} onChange={(e) => act(() => treasuryBudgetApi.setCategoryDefault(c.categoryId, e.target.value === "" ? null : Number(e.target.value)))}>
          <option value="">— (chosen when paying)</option>
          {(voci.data ?? []).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      ),
    },
  ];
  return (
    <Panel title="Register: Voce of a payment, by budget category" help={<>
        When a line of the budget is paid from TO PAY, the payment starts from the Voce of the category of the line (Asset → 1.1 Attrezzature, for example).
        It can always be changed in the form of the payment.
      </>}>
      <DataTable title="Voce by budget category" columns={columns} rows={defaults.data} rowKey={(c) => c.categoryId} empty="No categories" />
    </Panel>
  );
}
