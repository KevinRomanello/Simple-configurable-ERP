import type { Me } from "./types";

/** Whether a part of the ERP is on for this site (Settings › App › Modules): one the server does not list is on. */
export const moduleOn = (me: Pick<Me, "modules">, key: string): boolean => me.modules[key] !== false;
