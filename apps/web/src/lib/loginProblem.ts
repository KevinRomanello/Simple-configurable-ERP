/** The message for a `login_error` word; unknown words (a hand-made link) get the generic one. */
export function loginProblem(word: string | null, domain?: string | null): string | null {
  if (word === null) return null;
  const messages: Record<string, string> = {
    cancelled: "Sign-in was cancelled.",
    expired: "Sign-in expired: try again.",
    domain: domain ? `Only @${domain} accounts can sign in.` : "Only accounts of the team can sign in.",
    deactivated: "This account has been deactivated: ask an admin.",
  };
  return messages[word] ?? "Sign-in failed: try again.";
}
