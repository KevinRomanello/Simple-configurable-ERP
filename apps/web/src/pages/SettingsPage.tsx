import { faArrowDown, faArrowUp, faTrash } from "@fortawesome/free-solid-svg-icons";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { api } from "../api/client";
import type { BankCompare, Calculation, ItemField, SettingsView } from "../api/types";
import { Button, IconButton } from "../components/Button";
import { CommitInput } from "../components/CommitInput";
import { AddSection, DataTable, Field, FormPanel, Loading, Message, PageHeader, Panel, type Column } from "../components/ui";
import { useMe } from "../lib/auth";
import { FIELD_LABELS } from "../lib/inventory";
import { useAction } from "../lib/useAction";

const FIELDS: ItemField[] = ["purpose", "safetyCodes", "disposal", "storageNotes", "maintenanceNotes"];

/**
 * Settings (admins only): the lists the other pages choose from and the switches of the calculation.
 * They used to be written in the code. A change applies at once to every page and goes into the history.
 * Not designed in Figma: built from the models of the interface. docs/impostazioni.md
 */
export function SettingsPage() {
  const allowed = useMe().permissions.canManageSettings;
  const view = useQuery({ queryKey: ["settings"], queryFn: api.settings, enabled: allowed });

  if (!allowed) return <Message>Only an admin can change the settings.</Message>;
  if (!view.data) return <Loading />;
  const data = view.data;

  return (
    <>
      <PageHeader
        title="Settings"
        description="The lists the other pages choose from and the switches of the calculation. A change applies at once to every page and goes into the History. Something in use cannot be deleted."
      />
      <CalculationPanel calculation={data.calculation} />
      <CategoriesPanel data={data} />
      <div className="two-columns">
        <VatRatesPanel rates={data.vatRates} />
        <UnitsPanel units={data.units} />
      </div>
      <LocationsPanel locations={data.locations} />
    </>
  );
}

// --- pieces shared by the lists ----------------------------------------------------------------

/** The new order of a list when the entry at `index` moves one place up (-1) or down (+1). */
function moved(ids: number[], index: number, step: -1 | 1): number[] {
  const next = [...ids];
  [next[index], next[index + step]] = [next[index + step]!, next[index]!];
  return next;
}

/** The ↑↓ buttons of an ordered list. */
function OrderButtons({ ids, index, onOrder, label }: { ids: number[]; index: number; onOrder: (ids: number[]) => void; label: string }) {
  return (
    <span className="icon-row">
      <IconButton icon={faArrowUp} label={`Move ${label} up`} disabled={index === 0} onClick={() => onOrder(moved(ids, index, -1))} />
      <IconButton icon={faArrowDown} label={`Move ${label} down`} disabled={index === ids.length - 1} onClick={() => onOrder(moved(ids, index, 1))} />
    </span>
  );
}

/** The bin of an entry: off while something uses the entry. */
function DeleteButton({ label, usedBy, onDelete }: { label: string; usedBy: number; onDelete: () => void }) {
  return (
    <span title={usedBy > 0 ? `Used ${usedBy} times: it cannot be deleted` : undefined}>
      <IconButton icon={faTrash} label={`Delete ${label}`} danger disabled={usedBy > 0} onClick={onDelete} />
    </span>
  );
}

const usedBy = <T extends { usedBy: number }>(): Column<T> => ({ key: "usedBy", header: "USED BY", num: true, sort: (r) => r.usedBy, cell: (r) => r.usedBy || "" });

/** The yellow button under a list and, opened by it, the form with the one box of what is added. */
function QuickAdd({ id, noun, label, type = "text", onAdd }: { id: string; noun: string; label: string; type?: "text" | "number"; onAdd: (text: string) => Promise<boolean> }) {
  return <AddSection label={`New ${noun}`} form={(close) => <QuickAddForm id={id} noun={noun} label={label} type={type} onAdd={onAdd} onDone={close} />} />;
}

function QuickAddForm({ id, noun, label, type, onAdd, onDone }: { id: string; noun: string; label: string; type: "text" | "number"; onAdd: (text: string) => Promise<boolean>; onDone: () => void }) {
  const [text, setText] = useState("");
  const submit = async () => {
    if (await onAdd(text.trim())) onDone();
  };
  return (
    <FormPanel title={`New ${noun}`} submitLabel={`Add ${noun}`} canSubmit={text.trim() !== ""} onSubmit={submit} onCancel={onDone}>
      <Field label={label} htmlFor={id}>
        <input id={id} className="input small" type={type} step={type === "number" ? "0.01" : undefined} autoFocus value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
    </FormPanel>
  );
}

// --- the switches of the calculation ------------------------------------------------------------

/** One switch: its box on the left, what it does on the right. */
function Setting({ children, explanation }: { children: ReactNode; explanation: ReactNode }) {
  return (
    <div className="setting">
      {children}
      <div className="muted">{explanation}</div>
    </div>
  );
}

function CalculationPanel({ calculation }: { calculation: Calculation }) {
  const act = useAction();
  const asDraft = (c: Calculation) => ({ ...c, variancePercent: String(Math.round(c.varianceThreshold * 10_000) / 100), inflowRate: String(c.inflowVatRate) });
  const [draft, setDraft] = useState(asDraft(calculation));
  useEffect(() => setDraft(asDraft(calculation)), [calculation]);
  const changed = JSON.stringify(asDraft(calculation)) !== JSON.stringify(draft);
  const set = (change: Partial<typeof draft>) => setDraft({ ...draft, ...change });

  const save = async (event: FormEvent) => {
    event.preventDefault();
    await act(() =>
      api.updateCalculation({
        varianceThreshold: Number(draft.variancePercent) / 100,
        inflowVatRate: Number(draft.inflowRate),
        vatBaseWhenTotalSponsor: draft.vatBaseWhenTotalSponsor,
        bankCompare: draft.bankCompare,
      }),
    );
  };
  const compareChoice = (id: string, value: BankCompare, onChange: (value: BankCompare) => void) => (
    <select id={id} className="input small" value={value} onChange={(e) => onChange(e.target.value as BankCompare)}>
      <option value="day">By day</option>
      <option value="month">By month</option>
    </select>
  );

  return (
    <Panel title="Calculation">
      <form className="stack" onSubmit={save}>
        <Setting explanation="TOTAL highlights in red the variances between expected and actual outflow beyond this, up or down.">
          <Field label="Variance highlighted in TOTAL (%)" htmlFor="set-variance">
            <input id="set-variance" className="input small" type="number" min="0" max="100" step="0.01" value={draft.variancePercent} onChange={(e) => set({ variancePercent: e.target.value })} />
          </Field>
        </Setting>
        <Setting explanation="Money that comes in (CASH FLOW, New inflow) is sponsorship, which is invoiced: the team owes this VAT on every inflow, paid on the first day of the next quarter.">
          <Field label="VAT on inflows (%)" htmlFor="set-inflow-vat">
            <input id="set-inflow-vat" className="input small" type="number" min="0" max="100" step="0.01" value={draft.inflowRate} onChange={(e) => set({ inflowRate: e.target.value })} />
          </Field>
        </Setting>
        <Setting
          explanation={
            <>
              <p>
                When a sponsor covers a whole line (goods given with a counter-invoice, for example advertising), the team still pays the VAT
                of the counter-invoice. This says what that VAT is computed on. Example: goods worth 1,000.00 € from a sponsor at 11%.
              </p>
              <ul>
                <li><strong>On the whole value</strong>: 110.00 € of VAT for the team. This is what the treasurer confirmed (21 October 2026).</li>
                <li><strong>On what the sponsor does not cover</strong>: the sponsor covers everything, so 0.00 €: the counter-invoice costs nothing.</li>
              </ul>
              <p>It changes every line paid by such a sponsor, at once.</p>
            </>
          }
        >
          <Field label="VAT when a sponsor covers the whole line" htmlFor="set-vat-base">
            <select id="set-vat-base" className="input small" value={draft.vatBaseWhenTotalSponsor} onChange={(e) => set({ vatBaseWhenTotalSponsor: e.target.value as Calculation["vatBaseWhenTotalSponsor"] })}>
              <option value="net">On the whole value</option>
              <option value="net-minus-sponsor">On what the sponsor does not cover</option>
            </select>
          </Field>
        </Setting>
        <Setting
          explanation={
            <>
              The BANK balance is taken on a day: what happened before it is already in the balance. <strong>By day</strong>: an inflow,
              a purchase or a VAT payment counts if it comes after that day. <strong>By month</strong>: only if it is in a later month,
              so everything in the month of the BANK counts as already in it. The old sheet used by day for the summary and by month for the Gantt.
            </>
          }
        >
          <div className="inline-form">
            <Field label="BANK date, in the CASH FLOW summary" htmlFor="set-bank-summary">
              {compareChoice("set-bank-summary", draft.bankCompare.summary, (summary) => set({ bankCompare: { ...draft.bankCompare, summary } }))}
            </Field>
            <Field label="BANK date, in the Gantt" htmlFor="set-bank-timeline">
              {compareChoice("set-bank-timeline", draft.bankCompare.timeline, (timeline) => set({ bankCompare: { ...draft.bankCompare, timeline } }))}
            </Field>
          </div>
        </Setting>
        <div className="inline-form">
          <Button small type="submit" disabled={!changed}>Save</Button>
          <Button small variant="ghost" disabled={!changed} onClick={() => setDraft(asDraft(calculation))}>Undo</Button>
        </div>
      </form>
    </Panel>
  );
}

// --- the lists ----------------------------------------------------------------------------------

type CategoryRow = SettingsView["categories"][number];

function CategoriesPanel({ data }: { data: SettingsView }) {
  const act = useAction();
  const ids = data.categories.map((c) => c.id);
  const toggle = (fields: ItemField[], field: ItemField, on: boolean) => (on ? [...fields, field] : fields.filter((f) => f !== field));

  const columns: Column<CategoryRow>[] = [
    { key: "name", header: "CATEGORY", cell: (c) => <CommitInput value={c.name} label={`Name of ${c.name}`} onCommit={(name) => name !== "" && act(() => api.updateCategory(c.id, { name }))} /> },
    ...FIELDS.map(
      (field): Column<CategoryRow> => ({
        key: field,
        header: FIELD_LABELS[field].toUpperCase(),
        cell: (c) => (
          <input
            type="checkbox"
            aria-label={`${c.name}: ${FIELD_LABELS[field]}`}
            checked={c.fields.includes(field)}
            onChange={(e) => act(() => api.updateCategory(c.id, { fields: toggle(c.fields, field, e.target.checked) }))}
          />
        ),
      }),
    ),
    usedBy<CategoryRow>(),
    { key: "order", header: "ORDER", cell: (c) => <OrderButtons ids={ids} index={ids.indexOf(c.id)} label={c.name} onOrder={(order) => act(() => api.orderCategories(order))} /> },
    { key: "delete", header: "", num: true, cell: (c) => <DeleteButton label={c.name} usedBy={c.usedBy} onDelete={() => act(() => api.deleteCategory(c.id))} /> },
  ];

  return (
    <Panel title="Categories">
      <p className="muted">
        The categories of the budget and of the inventory, in their order (the blocks of TOTAL and of the Gantt follow it), and which optional
        fields an item of each category shows. Renaming a category renames it on every line and item.
      </p>
      <DataTable
        title="Categories"
        columns={columns}
        rows={data.categories}
        rowKey={(c) => c.id}
        empty="No categories"
        footer={
          <tr className="footer-row">
            <td>Items without a category</td>
            {FIELDS.map((field) => (
              <td key={field}>
                <input
                  type="checkbox"
                  aria-label={`Items without a category: ${FIELD_LABELS[field]}`}
                  checked={data.uncategorizedFields.includes(field)}
                  onChange={(e) => act(() => api.setUncategorizedFields(toggle(data.uncategorizedFields, field, e.target.checked)))}
                />
              </td>
            ))}
            <td colSpan={3} />
          </tr>
        }
      />
      <QuickAdd id="new-category" noun="category" label="Name" onAdd={(name) => act(() => api.createCategory(name))} />
    </Panel>
  );
}

function VatRatesPanel({ rates }: { rates: SettingsView["vatRates"] }) {
  const act = useAction();
  const columns: Column<SettingsView["vatRates"][number]>[] = [
    { key: "rate", header: "VAT RATE", num: true, sort: (r) => r.rate, cell: (r) => `${r.rate}%` },
    usedBy(),
    { key: "delete", header: "", num: true, cell: (r) => <DeleteButton label={`${r.rate}%`} usedBy={r.usedBy} onDelete={() => act(() => api.deleteVatRate(r.id))} /> },
  ];
  return (
    <Panel title="VAT rates">
      <p className="muted">The rates a line, a sponsor or an arrival can use. Used by: sponsors and budget lines.</p>
      <DataTable title="VAT rates" columns={columns} rows={rates} rowKey={(r) => r.id} empty="No rates" />
      <QuickAdd id="new-vat-rate" noun="VAT rate" label="Rate (%)" type="number" onAdd={(rate) => act(() => api.createVatRate(Number(rate)))} />
    </Panel>
  );
}

function UnitsPanel({ units }: { units: SettingsView["units"] }) {
  const act = useAction();
  const columns: Column<SettingsView["units"][number]>[] = [
    { key: "name", header: "UNIT", sort: (u) => u.name, cell: (u) => <CommitInput value={u.name} label={`Name of ${u.name}`} onCommit={(name) => name !== "" && act(() => api.renameUnit(u.id, name))} /> },
    usedBy(),
    { key: "delete", header: "", num: true, cell: (u) => <DeleteButton label={u.name} usedBy={u.usedBy} onDelete={() => act(() => api.deleteUnit(u.id))} /> },
  ];
  return (
    <Panel title="Units">
      <p className="muted">How an item is counted. Renaming a unit renames it on every item counted in it.</p>
      <DataTable title="Units" columns={columns} rows={units} rowKey={(u) => u.id} empty="No units" />
      <QuickAdd id="new-unit" noun="unit" label="Name" onAdd={(name) => act(() => api.createUnit(name))} />
    </Panel>
  );
}

type LocationRow = SettingsView["locations"][number];

/** The form of a new place: a site and a room. */
function NewPlace({ onDone }: { onDone: () => void }) {
  const act = useAction();
  const [site, setSite] = useState("");
  const [room, setRoom] = useState("");
  const submit = async () => {
    if (await act(() => api.createLocation({ site: site.trim(), room: room.trim() }))) onDone();
  };
  return (
    <FormPanel title="New place" submitLabel="Add place" canSubmit={site.trim() !== "" && room.trim() !== ""} onSubmit={submit} onCancel={onDone}>
      <Field label="Site" htmlFor="new-site">
        <input id="new-site" className="input small" autoFocus value={site} onChange={(e) => setSite(e.target.value)} />
      </Field>
      <Field label="Room" htmlFor="new-room">
        <input id="new-room" className="input small" value={room} onChange={(e) => setRoom(e.target.value)} />
      </Field>
    </FormPanel>
  );
}

function LocationsPanel({ locations }: { locations: SettingsView["locations"] }) {
  const act = useAction();
  const ids = locations.map((l) => l.id);

  const columns: Column<LocationRow>[] = [
    { key: "site", header: "SITE", cell: (l) => <CommitInput value={l.site} label={`Site of ${l.code}`} onCommit={(text) => text !== "" && act(() => api.updateLocation(l.id, { site: text }))} /> },
    { key: "room", header: "ROOM", cell: (l) => <CommitInput value={l.room} label={`Room of ${l.code}`} onCommit={(text) => text !== "" && act(() => api.updateLocation(l.id, { room: text }))} /> },
    { key: "code", header: "CODE", cellClass: () => "muted", cell: (l) => l.code },
    usedBy<LocationRow>(),
    { key: "order", header: "ORDER", cell: (l) => <OrderButtons ids={ids} index={ids.indexOf(l.id)} label={`${l.site} / ${l.room}`} onOrder={(order) => act(() => api.orderLocations(order))} /> },
    { key: "delete", header: "", num: true, cell: (l) => <DeleteButton label={`${l.site} / ${l.room}`} usedBy={l.usedBy} onDelete={() => act(() => api.deleteLocation(l.id))} /> },
  ];

  return (
    <Panel title="Places">
      <p className="muted">
        Where things are kept: a site and a room (the exact spot, "shelf 2, red box", is written with each arrival). The code is what the
        movements of the inventory store: it never changes, so renaming a place keeps its history right. Used by: movements of the inventory.
      </p>
      <DataTable title="Places" columns={columns} rows={locations} rowKey={(l) => l.id} empty="No places" />
      <AddSection label="New place" form={(close) => <NewPlace onDone={close} />} />
    </Panel>
  );
}
