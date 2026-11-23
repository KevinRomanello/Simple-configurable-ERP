import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useMe } from "../lib/auth";
import { moduleOn } from "../lib/modules";

/** The pages of a module: they open only while the module is on (Settings › App › Modules); otherwise the person goes to the first page. */
export function IfModule({ name, children }: { name: string; children: ReactNode }) {
  return moduleOn(useMe(), name) ? <>{children}</> : <Navigate to="/" replace />;
}
