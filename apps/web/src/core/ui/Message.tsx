import type { ReactNode } from "react";

/** A line in place of the content: loading, not found, nothing there yet. */
export function Message({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export const Loading = () => <Message>Loading…</Message>;
