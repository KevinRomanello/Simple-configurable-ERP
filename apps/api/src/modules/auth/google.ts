import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { AppError, forbidden } from "../../core/errors";

// Sign in with Google (OpenID Connect, authorization code flow with PKCE).
//
//   1. we send the person to Google with a random `state` and the PKCE `challenge`;
//   2. Google sends them back with a one-time `code`;
//   3. from the server we exchange the code (plus the PKCE `verifier` and our client secret)
//      for an ID token, and check it: signature, who it is for, expiry, verified email, and
//      that the account belongs to the team's Google Workspace domain.

export interface GoogleIdentity {
  email: string;
  name: string;
}

export interface GoogleClient {
  authorizeUrl(params: { state: string; challenge: string }): string;
  identify(params: { code: string; verifier: string }): Promise<GoogleIdentity>;
}

export interface GoogleOptions {
  clientId: string;
  clientSecret: string;
  allowedDomain: string;
  /** Where Google sends the person back: `<public url>/api/auth/callback`. */
  redirectUri: string;
}

/** Replaceable pieces, so tests can run the real verification without Google. */
export interface GoogleDeps {
  fetchFn?: typeof fetch;
  keys?: JWTVerifyGetKey;
}

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

const base64url = (bytes: Buffer) => bytes.toString("base64url");

/** A fresh `state`, PKCE verifier and its challenge (the SHA-256 of the verifier). */
export function newLoginAttempt() {
  const verifier = base64url(randomBytes(48));
  return {
    state: base64url(randomBytes(24)),
    verifier,
    challenge: base64url(createHash("sha256").update(verifier).digest()),
  };
}

export function createGoogleClient(options: GoogleOptions, deps: GoogleDeps = {}): GoogleClient {
  const fetchFn = deps.fetchFn ?? fetch;
  const keys = deps.keys ?? createRemoteJWKSet(new URL(JWKS_URL));
  const domain = options.allowedDomain.toLowerCase();

  return {
    authorizeUrl({ state, challenge }) {
      const url = new URL(AUTHORIZE_URL);
      url.search = new URLSearchParams({
        client_id: options.clientId,
        redirect_uri: options.redirectUri,
        response_type: "code",
        scope: "openid email profile",
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
        hd: domain, // only a hint for Google's screen: the real check is below
        prompt: "select_account",
      }).toString();
      return url.toString();
    },

    async identify({ code, verifier }) {
      const response = await fetchFn(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: options.clientId,
          client_secret: options.clientSecret,
          redirect_uri: options.redirectUri,
          grant_type: "authorization_code",
          code_verifier: verifier,
        }),
      });
      if (!response.ok) throw new AppError(401, "Google refused the login");
      const { id_token: idToken } = (await response.json()) as { id_token?: string };
      if (!idToken) throw new AppError(401, "Google sent no identity");

      let claims;
      try {
        ({ payload: claims } = await jwtVerify(idToken, keys, { issuer: ISSUERS, audience: options.clientId }));
      } catch {
        throw new AppError(401, "The identity from Google is not valid");
      }

      const email = typeof claims.email === "string" ? claims.email.toLowerCase() : "";
      if (!email || claims.email_verified !== true) throw new AppError(401, "The Google email is not verified");

      // `hd` is the Workspace domain of the account; it is absent for ordinary Gmail accounts.
      const belongs = claims.hd === domain && email.endsWith(`@${domain}`);
      if (!belongs) throw forbidden(`Only ${domain} accounts can sign in`);

      return { email, name: typeof claims.name === "string" && claims.name ? claims.name : email.split("@")[0]! };
    },
  };
}
