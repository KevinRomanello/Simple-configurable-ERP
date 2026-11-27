import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useMe } from "./auth";
import { useManifests, type Manifest } from "./manifest";
import type { Me } from "./types";

/**
 * The first page of the site (docs/moduli-architettura.md, §4.4 and §14, decision 5): the first page of the first module that is on, in the
 * order below (the budget's is its first area); with every module off, Settings. One day it can be each person's own choice
 * (docs/moduli-domande.md, road C): then only this body changes.
 */
export function homeOf(manifests: Manifest[], me: Me): ReactNode {
  // HARDCODED: the order of the modules the first page comes from (one day the choice of each person)
  const order = ["budget", "inventory", "treasury", "registry"];
  for (const key of order) {
    const page = manifests.find((m) => m.key === key)?.home?.(me);
    if (page) return page;
  }
  return <Navigate to="/settings" replace />;
}

/** The page at `/`: it sends the person to the first page of the site. */
export function HomePage() {
  const me = useMe();
  return <>{homeOf(useManifests(), me)}</>;
}
