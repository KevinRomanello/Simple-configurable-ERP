import { useQuery, useQueryClient } from "@tanstack/react-query";
import { platformApi } from "./api";
import { Chips } from "../core/Chips";
import { Loading, Panel } from "../core/ui";
import { useMe } from "./auth";
import { ROW_ACTION_MODES, useRowActionMode } from "../core/rowAction";
import { useTheme, type ThemeChoice } from "../core/theme";
import { useAction } from "../core/useAction";
import { TokensPanel } from "./TokensPanel";

/**
 * The App section of Settings (docs/impostazioni.md): how the site looks, for everyone; the switches of the site, the modules and the
 * keys of the services, for admins.
 */
export function AppSettings() {
  const { canManageSettings } = useMe().permissions;
  return (
    <>
      <AppearancePanel />
      {canManageSettings && <PhonePanel />}
      {canManageSettings && <ModulesPanel />}
      {canManageSettings && <TokensPanel />}
    </>
  );
}

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
  const modules = useQuery({ queryKey: ["modules"], queryFn: platformApi.modules });
  if (!modules.data) return <Loading />;
  // the menu and the pages read what is on from «me»: it is read again when a switch is turned
  const turn = async (key: string, enabled: boolean) => {
    if (await act(() => platformApi.setModule(key, enabled))) await Promise.all([queryClient.invalidateQueries({ queryKey: ["modules"] }), queryClient.invalidateQueries({ queryKey: ["me"] })]);
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
          {m.alsoOff.length > 0 && <p className="muted">Turning it off also hides {m.alsoOff.join("; ")}.</p>}
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
        onChange={(value) => void act(() => platformApi.updateSite({ editOnPhone: value === "on" }))}
      />
    </Panel>
  );
}
