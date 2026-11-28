import { useQuery } from "@tanstack/react-query";
import { inventoryApi } from "./api";
import type { InventoryLists, ItemField } from "./types";
import { FIELD_LABELS } from "./inventory";
import { ItemTypesPanel } from "./ItemTypesPanel";
import { platformApi } from "../../platform/api";
import type { SettingsView } from "../../platform/types";
import { CategoriesPanel, type CategoryRow } from "../../platform/CategoriesPanel";
import { CommitInput } from "../../core/CommitInput";
import { DraftNote } from "../../core/DraftNote";
import { DeleteButton } from "../../core/ListButtons";
import { QuickAdd, usedBy } from "../../core/QuickAdd";
import { AddSection, DataTable, Field, FormPanel, Loading, Panel, type Column } from "../../core/ui";
import { useAction } from "../../core/useAction";
import { fieldSetter, useDraft } from "../../core/useDraft";

const FIELDS: ItemField[] = ["purpose", "safetyCodes", "disposal", "storageNotes", "maintenanceNotes"];

/**
 * The Inventory section of Settings (admins and users, docs/impostazioni.md): the categories and the fields their items show, the
 * types, the units and the places.
 */
export function InventorySettings() {
  const view = useQuery({ queryKey: ["settings"], queryFn: platformApi.settings });
  // the inventory's lists (the fields of a category, the units, the places) are the inventory's: they come from its own address
  const lists = useQuery({ queryKey: ["inventory-lists"], queryFn: inventoryApi.inventoryLists });
  if (!view.data || !lists.data) return <Loading />;
  return (
    <>
      <CategoriesWithFields categories={view.data.categories} lists={lists.data} />
      <ItemTypesPanel categories={view.data.categories} />
      <UnitsPanel units={lists.data.units} />
      <LocationsPanel locations={lists.data.locations} />
    </>
  );
}

/** The categories (a list of the core, `CategoriesPanel`) with what the inventory adds: which optional fields an item of each category shows. */
function CategoriesWithFields({ categories, lists }: { categories: SettingsView["categories"]; lists: InventoryLists }) {
  const act = useAction();
  const toggle = (fields: ItemField[], field: ItemField, on: boolean) => (on ? [...fields, field] : fields.filter((f) => f !== field));
  const fieldsOf = (categoryId: number) => lists.categoryFields[categoryId] ?? [];

  const columns = FIELDS.map(
    (field): Column<CategoryRow> => ({
      key: field,
      header: FIELD_LABELS[field].toUpperCase(),
      cell: (c) => (
        <input
          type="checkbox"
          aria-label={`${c.name}: ${FIELD_LABELS[field]}`}
          checked={fieldsOf(c.id).includes(field)}
          onChange={(e) => act(() => inventoryApi.setCategoryFields(c.id, toggle(fieldsOf(c.id), field, e.target.checked)))}
        />
      ),
    }),
  );
  const footer = (
    <tr className="footer-row">
      <td />
      <td>Items without a category</td>
      {FIELDS.map((field) => (
        <td key={field}>
          <input
            type="checkbox"
            aria-label={`Items without a category: ${FIELD_LABELS[field]}`}
            checked={lists.uncategorizedFields.includes(field)}
            onChange={(e) => act(() => inventoryApi.setUncategorizedFields(toggle(lists.uncategorizedFields, field, e.target.checked)))}
          />
        </td>
      ))}
      <td colSpan={2} />
    </tr>
  );
  return <CategoriesPanel categories={categories} itemFields={{ columns, footer }} />;
}

function UnitsPanel({ units }: { units: InventoryLists["units"] }) {
  const act = useAction();
  const columns: Column<InventoryLists["units"][number]>[] = [
    { key: "name", header: "UNIT", sort: (u) => u.name, cell: (u) => <CommitInput value={u.name} label={`Name of ${u.name}`} onCommit={(name) => name !== "" && act(() => inventoryApi.renameUnit(u.id, name))} /> },
    usedBy(),
    { key: "delete", header: "", num: true, cell: (u) => <DeleteButton label={u.name} usedBy={u.usedBy} onDelete={() => act(() => inventoryApi.deleteUnit(u.id))} /> },
  ];
  return (
    <Panel title="Units" help={<>How an item is counted. Renaming a unit renames it on every item counted in it.</>}>
      <DataTable title="Units" columns={columns} rows={units} rowKey={(u) => u.id} empty="No units" />
      <QuickAdd id="new-unit" noun="unit" label="Name" onAdd={(name) => act(() => inventoryApi.createUnit(name))} />
    </Panel>
  );
}

type LocationRow = InventoryLists["locations"][number];

/** The form of a new place: a room and, if it has them, a shelf and its levels (several levels, with a comma, are several places). */
function NewPlace({ onDone }: { onDone: () => void }) {
  const act = useAction();
  const [form, setForm, saved] = useDraft("new-place", { room: "", shelf: "", level: "" });
  const { room, shelf, level } = form;
  const set = fieldSetter(setForm);
  const levels = level.split(",").map((l) => l.trim()).filter((l) => l !== "");
  const submit = async () => {
    if (await act(() => inventoryApi.createLocation({ room: room.trim(), ...(shelf.trim() ? { shelf: shelf.trim() } : {}), ...(levels.length > 0 ? { levels } : {}) }))) {
      saved.discard();
      onDone();
    }
  };
  return (
    <FormPanel
      title="New place"
      description="A room, and on it a shelf and a level, all plain text; the shelf and the level are optional. Several levels separated by a comma (1, 2, 3, 4) make one place each."
      submitLabel={levels.length > 1 ? `Add ${levels.length} places` : "Add place"}
      canSubmit={room.trim() !== "" && (levels.length === 0 || shelf.trim() !== "")}
      onSubmit={submit}
      onCancel={() => saved.leave(onDone)}
    >
      <DraftNote draft={saved} />
      <Field label="Room" htmlFor="new-room">
        <input id="new-room" className="input small" autoFocus value={room} onChange={(e) => set("room")(e.target.value)} />
      </Field>
      <Field label="Shelf" htmlFor="new-shelf">
        <input id="new-shelf" className="input small" value={shelf} onChange={(e) => set("shelf")(e.target.value)} />
      </Field>
      <Field label="Level" htmlFor="new-level">
        <input id="new-level" className="input small" value={level} placeholder="1, 2, 3" onChange={(e) => set("level")(e.target.value)} />
      </Field>
    </FormPanel>
  );
}

function LocationsPanel({ locations }: { locations: InventoryLists["locations"] }) {
  const act = useAction();
  const columns: Column<LocationRow>[] = [
    { key: "room", header: "ROOM", cell: (l) => <CommitInput wide value={l.room} label={`Room of ${l.code}`} onCommit={(text) => text !== "" && act(() => inventoryApi.updateLocation(l.id, { room: text }))} /> },
    { key: "shelf", header: "SHELF", cell: (l) => <CommitInput value={l.shelf} label={`Shelf of ${l.code}`} onCommit={(text) => act(() => inventoryApi.updateLocation(l.id, { shelf: text }))} /> },
    { key: "level", header: "LEVEL", cell: (l) => <CommitInput value={l.level} label={`Level of ${l.code}`} onCommit={(text) => act(() => inventoryApi.updateLocation(l.id, { level: text }))} /> },
    { key: "code", header: "CODE", cellClass: () => "muted", cell: (l) => l.code },
    usedBy<LocationRow>(),
    { key: "delete", header: "", num: true, cell: (l) => <DeleteButton label={l.label} usedBy={l.usedBy} onDelete={() => act(() => inventoryApi.deleteLocation(l.id))} /> },
  ];

  return (
    <Panel title="Places" help={<>
        Where things are kept: a room, and on it a shelf and a level (plain text; the shelf and the level are optional, a level needs a shelf).
        The exact spot, "red box", is written with each arrival. The code is what the movements of the inventory store: it never changes, so
        renaming a place keeps its history right. Used by: movements of the inventory.
      </>}>
      <DataTable title="Places" columns={columns} rows={locations} rowKey={(l) => l.id} empty="No places" reorder={{ label: (l) => l.label, onOrder: (order) => act(() => inventoryApi.orderLocations(order)) }} />
      <AddSection label="New place" draftKey="new-place" form={(close) => <NewPlace onDone={close} />} />
    </Panel>
  );
}
