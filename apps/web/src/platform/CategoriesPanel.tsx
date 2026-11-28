import type { ReactNode } from "react";
import { platformApi } from "./api";
import type { SettingsView } from "./types";
import { CommitInput } from "../core/CommitInput";
import { DeleteButton } from "../core/ListButtons";
import { QuickAdd, usedBy } from "../core/QuickAdd";
import { DataTable, Panel, type Column } from "../core/ui";
import { useAction } from "../core/useAction";

export type CategoryRow = SettingsView["categories"][number];

/**
 * The categories, a list of the core: the budget's lines and the inventory's items use them. It is in Settings › Inventory, where the
 * inventory adds which optional fields an item of each category shows (`itemFields`: its columns and its last row); with the inventory off
 * it is in Settings › App, without them (docs/impostazioni.md).
 */
export function CategoriesPanel({ categories, itemFields }: { categories: SettingsView["categories"]; itemFields?: { columns: Column<CategoryRow>[]; footer: ReactNode } }) {
  const act = useAction();
  const columns: Column<CategoryRow>[] = [
    { key: "name", header: "CATEGORY", cell: (c) => <CommitInput value={c.name} label={`Name of ${c.name}`} onCommit={(name) => name !== "" && act(() => platformApi.updateCategory(c.id, { name }))} /> },
    ...(itemFields?.columns ?? []),
    usedBy<CategoryRow>(),
    { key: "delete", header: "", num: true, cell: (c) => <DeleteButton label={c.name} usedBy={c.usedBy} onDelete={() => act(() => platformApi.deleteCategory(c.id))} /> },
  ];

  return (
    <Panel title="Categories" help={<>
        The categories of the budget and of the inventory, in their order (the blocks of TOTAL and of the Gantt follow it)
        {itemFields ? ", and which optional fields an item of each category shows" : ""}. Renaming a category renames it on every line and item.
      </>}>
      <DataTable
        title="Categories"
        columns={columns}
        rows={categories}
        rowKey={(c) => c.id}
        empty="No categories"
        reorder={{ label: (c) => c.name, onOrder: (order) => act(() => platformApi.orderCategories(order)) }}
        footer={itemFields?.footer}
      />
      <QuickAdd id="new-category" noun="category" label="Name" onAdd={(name) => act(() => platformApi.createCategory(name))} />
    </Panel>
  );
}
