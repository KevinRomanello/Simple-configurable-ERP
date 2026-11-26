import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { Navigate, NavLink, useParams } from "react-router";
import { api } from "../api/client";
import type { BankCompare, Calculation, ItemField, SettingsView } from "../api/types";
import { Button } from "../components/Button";
import { Chips } from "../components/Chips";
import { CommitInput } from "../components/CommitInput";
import { DraftNote } from "../components/DraftNote";
import { DeleteButton } from "../components/ListButtons";
import { QuickAdd, usedBy } from "../components/QuickAdd";
import { AddSection, DataTable, Field, FormPanel, Loading, Message, PageHeader, Panel, type Column } from "../components/ui";
import { useMe } from "../lib/auth";
import { FIELD_LABELS } from "../lib/inventory";
import { currentSection, SECTION_LABELS, settingsSections } from "../lib/settingsSections";
import { ROW_ACTION_MODES, useRowActionMode } from "../lib/rowAction";
import { useTheme, type ThemeChoice } from "../lib/theme";
import { useAction } from "../lib/useAction";
import { fieldSetter, useDraft } from "../lib/useDraft";
import { CashListsPanel } from "./CashListsPanel";
import { ItemTypesPanel } from "./ItemTypesPanel";
import { RegistrySettings } from "./registry/RegistrySettings";
import { SeasonsPanel } from "./SeasonsPanel";
import { TokensPanel } from "./TokensPanel";

const FIELDS: ItemField[] = ["purpose", "safetyCodes", "disposal", "storageNotes", "maintenanceNotes"];

/**
 * Settings, a section at a time (docs/impostazioni.md): the budget (seasons, the switches of the calculation, VAT rates; admins),
 * the inventory (categories, types, units, places; admins and users), the register of the treasury (the Voci and the payment
 * methods; admins and users with the treasury box) and the App (how the site looks, for everyone; the switches of the site and
 * the modules, for admins). Each section has its address
 * (`/settings/budget`…), and a person sees only the sections they can use. A change applies at once to every page and goes
 * into the history. Not designed in Figma: built from the models of the interface (the pills of the other pages as tabs).
 */
export function SettingsPage() {
  const me = useMe();
  const { canManageSettings, canManageInventory, canManageCash } = me.permissions;
  const view = useQuery({ queryKey: ["settings"], queryFn: api.settings, enabled: canManageSettings || canManageInventory });
  const allowed = settingsSections({ canManageSettings, canManageInventory, canManageCash }, me.modules);
  const asked = useParams().section;
  const section = currentSection(allowed, asked);

  // an address that is not one of the person's sections goes to the first of them (a viewer has one only: no tabs, no redirect)
  if (allowed.length > 1 && asked !== section) return <Navigate to={`/settings/${section}`} replace />;
  const needsLists = section === "budget" || section === "inventory";
  if (needsLists && !view.data) return <Loading />;

  return (
    <>
      <PageHeader
        title="Settings"
        description={
          allowed.length === 1
            ? me.readOnly
              ? "How the site looks for you. Editing is turned off on phones: use a computer for the other settings."
              : "How the site looks for you. The other settings are kept by an admin, a user or the treasury."
            : "How the site looks, and the lists and switches the other pages work from. A change applies at once to every page and goes into the History. Something in use cannot be deleted."
        }
      />
      {allowed.length > 1 && (
        <nav className="toggle-row" aria-label="Sections of the settings">
          {allowed.map((key) => (
            <NavLink key={key} to={`/settings/${key}`} className={({ isActive }) => `chip${isActive ? " on" : ""}`}>{SECTION_LABELS[key]}</NavLink>
          ))}
        </nav>
      )}
      {section === "budget" && view.data && (
        <>
          <SeasonsPanel />
          <CalculationPanel key={JSON.stringify(view.data.calculation)} calculation={view.data.calculation} />
          <VatRatesPanel rates={view.data.vatRates} />
        </>
      )}
      {section === "inventory" && view.data && (
        <>
          <CategoriesPanel data={view.data} />
          <ItemTypesPanel categories={view.data.categories} />
          <UnitsPanel units={view.data.units} />
          <LocationsPanel locations={view.data.locations} />
        </>
      )}
      {section === "register" && <CashListsPanel />}
      {section === "registry" && <RegistrySettings />}
      {section === "app" && (
        <>
          <AppearancePanel />
          {canManageSettings && <PhonePanel />}
          {canManageSettings && <ModulesPanel />}
          {canManageSettings && <TokensPanel />}
        </>
      )}
    </>
  );
}

// --- how the site looks: for everyone ----------------------------------------------------------

const THEMES: { value: ThemeChoice; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Like my device" },
];

/**
 * Light or dark, and how the actions on a row open (pay, receive, change…), for whoever is signed in (a viewer too): kept in this
 * browser, not in the database, and not in the History.
 */
function AppearancePanel() {
  const [theme, setTheme] = useTheme();
  const [rowAction, setRowAction] = useRowActionMode();
  return (
    <Panel title="Appearance">
      <p className="muted">
        The colours of the site: light or dark. «Like my device» follows the light or dark of your computer or phone. The choices here are for this browser only:
        on another computer or phone you choose again.
      </p>
      <Chips label="Theme" options={THEMES} value={theme} onChange={setTheme} />
      <p className="muted">
        Where an action on a row opens (Pay, Receive, Change…): in a panel under the row, in a dialog in the middle of the page, in a side panel, or in a small popover by the button.
        The popover is for the actions that have a short form (Pay, Mark as received); the others open as a dialog. An action that belongs to no row opens as a dialog when the choice is «Under the row».
      </p>
      <Chips label="Row actions" options={ROW_ACTION_MODES} value={rowAction} onChange={setRowAction} />
    </Panel>
  );
}

/**
 * The parts of the ERP that can be turned off (admins): one that is off is not shown anywhere, in the menu, in the pages or in
 * the settings, and its addresses answer «not found»; what it keeps stays where it is, until it is turned on again (docs/moduli.md).
 */
function ModulesPanel() {
  const act = useAction();
  const queryClient = useQueryClient();
  const modules = useQuery({ queryKey: ["modules"], queryFn: api.modules });
  if (!modules.data) return <Loading />;
  // the menu and the pages read what is on from «me»: it is read again when a switch is turned
  const turn = async (key: string, enabled: boolean) => {
    if (await act(() => api.setModule(key, enabled))) await Promise.all([queryClient.invalidateQueries({ queryKey: ["modules"] }), queryClient.invalidateQueries({ queryKey: ["me"] })]);
  };
  return (
    <Panel title="Modules">
      <p className="muted">
        The parts of the ERP that can be turned off. A module that is <strong>Off</strong> does not appear in the menu or anywhere else, and nothing can reach it (not even the keys of the services): what it
        keeps is not touched, and everything comes back when it is turned on again.
      </p>
      {modules.data.map((m) => (
        <div key={m.key} className="stack tight">
          <strong>{m.label}</strong>
          <p className="muted">{m.description}</p>
          <Chips label={`${m.label} module`} options={[{ value: "on", label: "On" }, { value: "off", label: "Off" }]} value={m.enabled ? "on" : "off"} onChange={(value) => void turn(m.key, value === "on")} />
        </div>
      ))}
    </Panel>
  );
}

/** Whether the site can be changed from a phone: the admins' switch for everybody (on a phone it is read-only when off). */
function PhonePanel() {
  const act = useAction();
  const { editOnPhone } = useMe();
  return (
    <Panel title="Editing on a phone">
      <p className="muted">
        On a phone it is easy to touch something by mistake. When this is <strong>Off</strong>, the site is read-only for everybody on a phone (a screen up to 767 px wide): they can look, search
        and download, but there are no buttons to add, change or delete. Computers and tablets are not affected. It is not a lock: it only hides the commands, and what someone is
        allowed to do stays as it is. To turn it on again, use a computer.
      </p>
      <Chips
        label="Editing on a phone"
        options={[{ value: "on", label: "On" }, { value: "off", label: "Off" }]}
        value={editOnPhone ? "on" : "off"}
        onChange={(value) => void act(() => api.updateSite({ editOnPhone: value === "on" }))}
      />
    </Panel>
  );
}

// --- pieces shared by the lists ----------------------------------------------------------------

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
  // what is written is kept while it is typed; the panel starts over (key) when the saved values change, and a draft started from other values says so
  const [initial] = useState(() => asDraft(calculation));
  const [draft, setDraft, saved] = useDraft("settings:calculation", initial, { base: JSON.stringify(initial) });
  const changed = JSON.stringify(initial) !== JSON.stringify(draft);
  const set = (change: Partial<typeof draft>) => setDraft({ ...draft, ...change });

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await act(() =>
      api.updateCalculation({
        varianceThreshold: Number(draft.variancePercent) / 100,
        inflowVatRate: Number(draft.inflowRate),
        vatBaseWhenTotalSponsor: draft.vatBaseWhenTotalSponsor,
        bankCompare: draft.bankCompare,
      }),
    );
    if (ok) saved.discard();
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
        <DraftNote draft={saved} name="The calculation settings" />
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
          <Button small variant="ghost" disabled={!changed} onClick={saved.discard}>Undo</Button>
        </div>
      </form>
    </Panel>
  );
}

// --- the lists ----------------------------------------------------------------------------------

type CategoryRow = SettingsView["categories"][number];

function CategoriesPanel({ data }: { data: SettingsView }) {
  const act = useAction();
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
        reorder={{ label: (c) => c.name, onOrder: (order) => act(() => api.orderCategories(order)) }}
        footer={
          <tr className="footer-row">
            <td />
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
            <td colSpan={2} />
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

/** The form of a new place: a room and, if it has them, a shelf and its levels (several levels, with a comma, are several places). */
function NewPlace({ onDone }: { onDone: () => void }) {
  const act = useAction();
  const [form, setForm, saved] = useDraft("new-place", { room: "", shelf: "", level: "" });
  const { room, shelf, level } = form;
  const set = fieldSetter(setForm);
  const levels = level.split(",").map((l) => l.trim()).filter((l) => l !== "");
  const submit = async () => {
    if (await act(() => api.createLocation({ room: room.trim(), ...(shelf.trim() ? { shelf: shelf.trim() } : {}), ...(levels.length > 0 ? { levels } : {}) }))) {
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

function LocationsPanel({ locations }: { locations: SettingsView["locations"] }) {
  const act = useAction();
  const columns: Column<LocationRow>[] = [
    { key: "room", header: "ROOM", cell: (l) => <CommitInput wide value={l.room} label={`Room of ${l.code}`} onCommit={(text) => text !== "" && act(() => api.updateLocation(l.id, { room: text }))} /> },
    { key: "shelf", header: "SHELF", cell: (l) => <CommitInput value={l.shelf} label={`Shelf of ${l.code}`} onCommit={(text) => act(() => api.updateLocation(l.id, { shelf: text }))} /> },
    { key: "level", header: "LEVEL", cell: (l) => <CommitInput value={l.level} label={`Level of ${l.code}`} onCommit={(text) => act(() => api.updateLocation(l.id, { level: text }))} /> },
    { key: "code", header: "CODE", cellClass: () => "muted", cell: (l) => l.code },
    usedBy<LocationRow>(),
    { key: "delete", header: "", num: true, cell: (l) => <DeleteButton label={l.label} usedBy={l.usedBy} onDelete={() => act(() => api.deleteLocation(l.id))} /> },
  ];

  return (
    <Panel title="Places">
      <p className="muted">
        Where things are kept: a room, and on it a shelf and a level (plain text; the shelf and the level are optional, a level needs a shelf).
        The exact spot, "red box", is written with each arrival. The code is what the movements of the inventory store: it never changes, so
        renaming a place keeps its history right. Used by: movements of the inventory.
      </p>
      <DataTable title="Places" columns={columns} rows={locations} rowKey={(l) => l.id} empty="No places" reorder={{ label: (l) => l.label, onOrder: (order) => act(() => api.orderLocations(order)) }} />
      <AddSection label="New place" draftKey="new-place" form={(close) => <NewPlace onDone={close} />} />
    </Panel>
  );
}
