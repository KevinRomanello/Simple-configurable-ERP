// What a module or a bridge tells the site about itself (docs/moduli-architettura.md, §7.2): its pages, its groups and entries of the
// menu, its sections of Settings. App.tsx hands the list to the platform; the pages, the menu and Settings are built from the manifests
// that are on. A module the server says is off (Settings › App › Modules) is left out, and so is a bridge with one of its modules off.
import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { createContext, useContext, type ComponentType, type ReactNode } from "react";
import { NavLink } from "react-router";
import type { Fill } from "../core/slots";
import { useMe } from "./auth";
import { moduleOn } from "./modules";
import type { Me } from "./types";

/** A page: its address, written as a Route of react-router takes it, and what it shows. */
export interface PageRoute {
  path: string;
  element: ReactNode;
}

/** A group of the menu (Budget, Views, Treasury…). */
export interface MenuGroup {
  id: string;
  title: string;
  /** Its place in the menu: the groups follow the sheets of the Excel file (Budget 26-27), then the ones it does not have. */
  order: number;
  /** The beginnings of the addresses of its pages: the group of the page you are on opens by itself. */
  paths: string[];
  /** Whether the person sees the group. It is called as a hook, so it may ask the server (the Registry does). Without it, everyone does. */
  useShown?: (me: Me) => boolean;
}

/** An entry of the menu, in a group of its own module or of another one (TO PAY, of a bridge, is in the Treasury group). */
export interface MenuEntry {
  group: string;
  /** Its place in the group. */
  order: number;
  /** Who sees it, among those who see the group. Without it, all of them. */
  shown?: (me: Me) => boolean;
  /** The beginnings of the addresses of its pages that the group's own do not cover: they open the group too. */
  paths?: string[];
  /** A `MenuLink`, or a component that draws several (the areas of the budget, the tables of the registry). */
  element: ReactNode;
}

/** A section of Settings: its tab and its address (`/settings/<key>`), who may use it, and what it shows. */
export interface SettingsSection {
  key: string;
  label: string;
  /** Its place among the tabs. */
  order: number;
  allowed: (me: Me) => boolean;
  Content: ComponentType;
}

export interface Manifest {
  key: string;
  /** The modules it needs: a bridge is on only while both of its modules are. Without it, the module itself; the platform needs none. */
  needs?: string[];
  routes?: PageRoute[];
  /** Pages outside the sign-in (the public forms of the registry). */
  openRoutes?: PageRoute[];
  menuGroups?: MenuGroup[];
  menu?: MenuEntry[];
  settings?: SettingsSection[];
  /** What it puts in the slots of the pages of others (docs/moduli-architettura.md, §7.4): a bridge fills those of its two modules. */
  fills?: Fill[];
  /** Its first page, when the site starts from it (`homeOf`): nothing when this person cannot see any of its pages. */
  home?: (me: Me) => ReactNode;
}

/** Whether a manifest is on for this site: all the modules it needs are on. */
export const manifestOn = (manifest: Manifest, me: Pick<Me, "modules">): boolean => (manifest.needs ?? [manifest.key]).every((key) => moduleOn(me, key));

export const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order;

const Manifests = createContext<Manifest[]>([]);

/** Hands every manifest of the site to the pages below it (App.tsx). */
export const ManifestsProvider = Manifests.Provider;

/** The manifests that are on for this site. */
export function useManifests(): Manifest[] {
  const me = useMe();
  return useContext(Manifests).filter((manifest) => manifestOn(manifest, me));
}

/** A link of the menu. `end`: it is lit only for its own page, not for the pages below it (INVENTORY next to PENDING). */
export function MenuLink({ to, icon, end, children }: { to: string; icon: IconDefinition; end?: boolean; children: string }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
      <FontAwesomeIcon icon={icon} fixedWidth />
      {children}
    </NavLink>
  );
}
