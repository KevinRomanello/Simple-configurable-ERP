import { useQuery, type QueryClient } from "@tanstack/react-query";
import { createContext, useContext, type ReactNode } from "react";
import { api, ApiError } from "../api/client";
import type { Me } from "../api/types";
import { LoginPage } from "../pages/LoginPage";

const MeContext = createContext<Me | null>(null);

/** The signed-in person. Only usable inside <AuthGate>, which shows the sign-in page otherwise. */
export function useMe(): Me {
  const me = useContext(MeContext);
  if (!me) throw new Error("useMe() outside of <AuthGate>");
  return me;
}

/** Forgets the signed-in person: the gate then shows the sign-in page. */
export const forgetUser = (queryClient: QueryClient) => queryClient.setQueryData(["me"], null);

/**
 * Wraps the whole app. It asks the server who is signed in; nobody means the sign-in page, so
 * a session that expires (or is revoked) in the middle of work ends up there too.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  if (me.isPending) return <p className="empty">Loading…</p>;
  // an answer of the server (a deactivated account) is worded by the server; no answer is "cannot be reached"
  if (me.error instanceof ApiError) return <p className="empty">{me.error.message}. Ask an admin if this is a mistake.</p>;
  if (me.isError) return <p className="empty">The server cannot be reached. Try again in a moment.</p>;
  if (me.data === null) return <LoginPage />;
  return <MeContext value={me.data}>{children}</MeContext>;
}
