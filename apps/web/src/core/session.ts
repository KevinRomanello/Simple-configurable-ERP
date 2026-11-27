import { createContext, useContext } from "react";

/**
 * What the core needs to know of whoever is signed in, given by the platform when someone signs in (`AuthGate`): the core knows no
 * one (docs/moduli-architettura.md, §7.3). Their id, because the drafts kept in this browser are theirs; and what to do when the
 * server says the session is over (a write refused with 401 sends them to the sign-in page).
 */
export interface Session {
  userId: number;
  expired: () => void;
}

const SessionContext = createContext<Session | null>(null);

export const SessionProvider = SessionContext.Provider;

/** The session of whoever is signed in. Only usable inside the signed-in site. */
export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession() outside of the signed-in site");
  return session;
}
