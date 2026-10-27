import { faRightToBracket, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { loginProblem } from "../lib/loginProblem";

/**
 * Shown when nobody is signed in. Sign-in is with the team's Google account, or by the
 * organisation's login proxy (then there is nothing to press here: the page is only reached when
 * the request did not come through the proxy); the developer button exists only on a development
 * server (see docs/hardcoded-registry.md).
 * Not designed in Figma yet: built from the design-system tokens and components only.
 */
export function LoginPage() {
  const options = useQuery({ queryKey: ["sign-in-options"], queryFn: api.signInOptions });
  // The server sends the person back to "/?login_error=<word>" when Google sign-in did not work.
  // The words are worded here: text taken from the address is never shown.
  const problem = loginProblem(new URLSearchParams(window.location.search).get("login_error"), options.data?.domain);

  return (
    <main className="login">
      <section className="login-card">
        <div className="brand">
          <strong>E-Agle TRT</strong>
          <span className="label-s muted">Budget 2026-2027</span>
        </div>
        <h1>Sign in</h1>

        {problem && (
          <p className="hint error" role="alert">
            <FontAwesomeIcon icon={faTriangleExclamation} /> {problem}
          </p>
        )}

        {options.isError && <p className="muted">The server cannot be reached. Try again in a moment.</p>}

        {options.data?.google && (
          <>
            {/* A plain link, not a fetch: the browser must follow the redirects to Google and back. */}
            <a className="btn" href="/api/auth/login">
              <FontAwesomeIcon icon={faRightToBracket} /> Sign in with Google
            </a>
            {options.data.domain && <p className="hint">Use your @{options.data.domain} account.</p>}
          </>
        )}

        {options.data?.devLogin && (
          <a className="btn ghost" href="/api/auth/dev-login">
            Sign in as developer
          </a>
        )}

        {options.data?.proxy && (
          <>
            <p className="muted">Sign-in is done by your organisation's login. Open the site from its usual address and sign in there.</p>
            <a className="btn" href="/">Try again</a>
          </>
        )}

        {options.data && !options.data.google && !options.data.devLogin && !options.data.proxy && (
          <p className="muted">Sign-in is not configured on this server.</p>
        )}
      </section>
    </main>
  );
}
