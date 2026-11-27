import { faAnglesLeft, faBars, faChevronDown, faRightFromBracket, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { Outlet, useLocation } from "react-router";
import { platformApi } from "./api";
import { forgetUser, useMe } from "./auth";
import { ignorePasswordManagers } from "../core/ignorePasswordManagers";
import { byOrder, useManifests, type MenuEntry, type MenuGroup } from "./manifest";
import { ROLE_NAME } from "./permissions";
import { useChosenSeasonId, useSeason } from "./season";
import { SCREEN, useMaxWidth } from "../core/screen";
import { IconButton } from "../core/Button";
import { ExportProvider } from "../core/ExportBlocks";
import { FillsProvider } from "../core/slots";
import { SeasonStrip, SeasonSwitcher } from "./SeasonSwitcher";

const CLOSED_GROUPS_KEY = "erp.menu-closed";

/** The groups of the menu the person folded; remembered in this browser (and fine without it: every group is open). */
function useClosedGroups() {
  const [closed, setClosed] = useState<string[]>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(CLOSED_GROUPS_KEY) ?? "[]");
      return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string") : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(CLOSED_GROUPS_KEY, JSON.stringify(closed));
    } catch {
      // private window or blocked storage: the choice is simply not remembered
    }
  }, [closed]);
  return {
    closed,
    toggle: (id: string) => setClosed((now) => (now.includes(id) ? now.filter((g) => g !== id) : [...now, id])),
    open: (id: string) => setClosed((now) => (now.includes(id) ? now.filter((g) => g !== id) : now)),
  };
}

/** A group of the menu: its title folds and unfolds it. The same on a computer, a tablet and a phone. */
function NavGroup({ id, title, closed, onToggle, children }: { id: string; title: string; closed: string[]; onToggle: (id: string) => void; children: ReactNode }) {
  const open = !closed.includes(id);
  return (
    <nav className="nav-group" aria-label={title}>
      <button type="button" className="nav-title label-xs bold" aria-expanded={open} aria-controls={`nav-${id}`} onClick={() => onToggle(id)}>
        {title}
        <FontAwesomeIcon icon={faChevronDown} className={`nav-chevron${open ? "" : " shut"}`} />
      </button>
      <div id={`nav-${id}`} className="nav-items" hidden={!open}>
        {children}
      </div>
    </nav>
  );
}

/** A group of the menu with its entries, when the person sees it (each group asks on its own: the Registry asks the server). */
function ShownGroup({ group, entries, closed, onToggle }: { group: MenuGroup; entries: MenuEntry[]; closed: string[]; onToggle: (id: string) => void }) {
  const me = useMe();
  const shown = group.useShown?.(me) ?? true;
  if (!shown) return null;
  return (
    <NavGroup id={group.id} title={group.title} closed={closed} onToggle={onToggle}>
      {entries.filter((entry) => entry.shown?.(me) ?? true).map((entry) => (
        <Fragment key={entry.order}>{entry.element}</Fragment>
      ))}
    </NavGroup>
  );
}

const SIDEBAR_HIDDEN_KEY = "erp.sidebar-hidden";

/** Whether the menu is hidden; remembered in this browser (and fine without it: the menu is just shown). */
function useSidebarHidden() {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_HIDDEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_HIDDEN_KEY, hidden ? "1" : "0");
    } catch {
      // private window or blocked storage: the choice is simply not remembered
    }
  }, [hidden]);
  return [hidden, () => setHidden((value) => !value)] as const;
}

/**
 * The menu of a phone or a tablet: the same as on a computer, shown over the page from the bar at the top, and closed by
 * itself when the page or the season changes, with Esc or by touching outside it. While it is open the page under
 * it does not scroll, and the entry of the page you are on is in sight.
 */
function useCompactMenu(compact: boolean) {
  const { pathname } = useLocation();
  const season = useChosenSeasonId();
  const [shown, setShown] = useState(false);
  useEffect(() => setShown(false), [pathname, compact, season]);
  useEffect(() => {
    if (!shown) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setShown(false);
    document.addEventListener("keydown", close);
    document.body.classList.add("no-scroll");
    // the page you are on is in sight, even far down the menu
    document.querySelector("#sidebar .nav-link.active")?.scrollIntoView({ block: "nearest" });
    return () => {
      document.removeEventListener("keydown", close);
      document.body.classList.remove("no-scroll");
    };
  }, [shown]);
  return [shown, setShown] as const;
}

/** Page frame: the menu of the modules that are on (their manifests), and the page. */
export function Shell() {
  const compact = useMaxWidth(SCREEN.tablet);
  const [hidden, toggleSidebar] = useSidebarHidden();
  const [menuShown, setMenuShown] = useCompactMenu(compact);
  const me = useMe();
  // the fields of the working site are never a form for a password manager (the public forms of the registry are outside it)
  useEffect(() => ignorePasswordManagers(), []);
  // a module that is turned off is not in the menu at all, and nothing is asked of it (Settings › App › Modules)
  const manifests = useManifests();
  const menuGroups = manifests.flatMap((manifest) => manifest.menuGroups ?? []).sort(byOrder);
  const entries = manifests.flatMap((manifest) => manifest.menu ?? []);
  const fills = manifests.flatMap((manifest) => manifest.fills ?? []);
  const queryClient = useQueryClient();
  // behind the organisation's login there is nothing to sign out of here
  const signInOptions = useQuery({ queryKey: ["sign-in-options"], queryFn: platformApi.signInOptions });
  const { pathname } = useLocation();
  const season = useSeason();
  const chosenSeason = useChosenSeasonId();
  const groups = useClosedGroups();
  // the group of the page you are on is open, even if it was folded before
  const openGroup = groups.open;
  useEffect(() => {
    const pathsOf = (group: MenuGroup) => [...group.paths, ...entries.flatMap((entry) => (entry.group === group.id ? (entry.paths ?? []) : []))];
    const found = menuGroups.find((group) => pathsOf(group).some((path) => pathname.startsWith(path)));
    if (found) openGroup(found.id);
  }, [pathname]);

  const signOut = async () => {
    await platformApi.signOut();
    forgetUser(queryClient); // shows the sign-in page...
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" }); // ...and drops the data of this person
  };
  // the season is chosen in the menu; the bar of a phone only says which one it is
  const brand = (choice: boolean) => (
    <div className="brand-text">
      <strong>E-Agle TRT</strong>
      {choice ? <SeasonSwitcher /> : <span className="label-s muted">Budget {season?.name ?? ""}</span>}
    </div>
  );
  const frame = compact ? `shell compact${menuShown ? " menu-shown" : ""}` : `shell${hidden ? " collapsed" : ""}`;

  return (
    <div className={frame}>
      {compact && (
        <header className="topbar">
          {brand(false)}
          {me.readOnly && <span className="pill teal" title="An admin turned editing off on phones: the site can be looked at, not changed. Use a computer to change it.">Read only</span>}
          <button type="button" className="icon-btn burger" aria-label="Show the menu" aria-expanded={menuShown} aria-controls="sidebar" onClick={() => setMenuShown(true)}>
            <FontAwesomeIcon icon={faBars} />
          </button>
        </header>
      )}
      {!compact && hidden && (
        <button type="button" className="icon-btn menu-open" title="Show the menu" aria-label="Show the menu" aria-expanded={false} onClick={toggleSidebar}>
          <FontAwesomeIcon icon={faBars} />
        </button>
      )}
      {compact && menuShown && <div className="menu-backdrop" onClick={() => setMenuShown(false)} />}
      <aside className="sidebar" id="sidebar">
        <div className="brand">
          {brand(true)}
          {compact ? (
            <button type="button" className="icon-btn burger" aria-label="Close the menu" onClick={() => setMenuShown(false)}>
              <FontAwesomeIcon icon={faXmark} />
            </button>
          ) : (
            <button type="button" className="icon-btn" title="Hide the menu" aria-label="Hide the menu" aria-expanded aria-controls="sidebar" onClick={toggleSidebar}>
              <FontAwesomeIcon icon={faAnglesLeft} />
            </button>
          )}
        </div>

        {/* the groups follow the order of the sheets of the Excel file (Budget 26-27), then the ones it does not have */}
        {menuGroups.map((group) => (
          <ShownGroup key={group.id} group={group} entries={entries.filter((entry) => entry.group === group.id).sort(byOrder)} closed={groups.closed} onToggle={groups.toggle} />
        ))}

        <div className="sidebar-footer">
          <div className="who">
            <strong>{me.name}</strong>
            <span className="label-s muted">{ROLE_NAME[me.role]}</span>
          </div>
          {signInOptions.data?.proxy === false && <IconButton icon={faRightFromBracket} label="Sign out" onClick={signOut} />}
        </div>
      </aside>
      <main className="main">
        {/* the TOTAL pages do not follow the season of the menu: no strip there */}
        {!pathname.startsWith("/total/") && <SeasonStrip />}
        <ExportProvider>
          {/* what the parts that are on put in the pages of the others (the slots) */}
          <FillsProvider value={fills}>
            {/* one page per address and per season: the areas, items and components share a page, and without
                the key a form left open on one would still be open (and write) on the next, or in another season */}
            <Outlet key={`${chosenSeason ?? "today"}:${pathname}`} />
          </FillsProvider>
        </ExportProvider>
      </main>
    </div>
  );
}
