import { createHash } from "node:crypto";
import { exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { AppError } from "../../core/errors";
import { createGoogleClient, newLoginAttempt } from "./google";

// The real verification code runs here against ID tokens we sign ourselves with a throwaway key,
// and a fake "token endpoint": no contact with Google.

const options = {
  clientId: "client-123.apps.googleusercontent.com",
  clientSecret: "secret",
  allowedDomain: "example.org",
  redirectUri: "https://budget.example.org/api/auth/callback",
};

let privateKey: CryptoKey;
let keys: JWTVerifyGetKey;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  const publicKey = pair.publicKey;
  keys = async () => publicKey;
  await exportJWK(publicKey); // proves the key is a normal exportable RSA key
});

interface Claims {
  email?: string;
  email_verified?: boolean;
  hd?: string;
  name?: string;
  aud?: string;
  iss?: string;
  exp?: number | string;
}

async function idToken(claims: Claims = {}) {
  const { aud, iss, exp, ...rest } = claims;
  return new SignJWT({ email: "ann@example.org", email_verified: true, hd: "example.org", name: "Ann Rossi", ...rest })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(iss ?? "https://accounts.google.com")
    .setAudience(aud ?? options.clientId)
    .setIssuedAt()
    .setExpirationTime(exp ?? "10m")
    .sign(privateKey);
}

/** A fake token endpoint that answers with the given ID token (or a refusal). */
function client(answer: { token?: string; status?: number }) {
  const calls: { url: string; body: URLSearchParams }[] = [];
  const fetchFn = (async (url: string, init: { body: URLSearchParams }) => {
    calls.push({ url, body: init.body });
    return new Response(JSON.stringify(answer.token ? { id_token: answer.token } : {}), { status: answer.status ?? 200 });
  }) as unknown as typeof fetch;
  return { google: createGoogleClient(options, { fetchFn, keys }), calls };
}

const identify = (google: ReturnType<typeof client>["google"]) => google.identify({ code: "the-code", verifier: "the-verifier" });

describe("authorizeUrl", () => {
  const { google } = client({});

  it("sends the person to Google with everything the flow needs", () => {
    const url = new URL(google.authorizeUrl({ state: "s123", challenge: "c456" }));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: options.clientId,
      redirect_uri: options.redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state: "s123",
      code_challenge: "c456",
      code_challenge_method: "S256",
      hd: "example.org",
    });
  });
});

describe("newLoginAttempt", () => {
  it("makes a random state and a PKCE challenge that is the SHA-256 of the verifier", () => {
    const a = newLoginAttempt();
    expect(a.challenge).toBe(createHash("sha256").update(a.verifier).digest("base64url"));
    expect(a.verifier.length).toBeGreaterThanOrEqual(43);
    expect(newLoginAttempt().state).not.toBe(a.state);
  });
});

describe("identify", () => {
  it("returns who signed in, and sends Google the code, our secret and the PKCE verifier", async () => {
    const { google, calls } = client({ token: await idToken() });
    expect(await identify(google)).toEqual({ email: "ann@example.org", name: "Ann Rossi" });
    expect(calls[0]!.url).toBe("https://oauth2.googleapis.com/token");
    expect(Object.fromEntries(calls[0]!.body)).toMatchObject({
      code: "the-code",
      client_secret: "secret",
      grant_type: "authorization_code",
      code_verifier: "the-verifier",
      redirect_uri: options.redirectUri,
    });
  });

  it("accepts both spellings of Google's issuer and lower-cases the email", async () => {
    const { google } = client({ token: await idToken({ iss: "accounts.google.com", email: "Ann@Example.org" }) });
    expect((await identify(google)).email).toBe("ann@example.org");
  });

  it("falls back to the part before the @ when Google sends no name", async () => {
    const { google } = client({ token: await idToken({ name: "" }) });
    expect((await identify(google)).name).toBe("ann");
  });

  const refused = async (answer: Parameters<typeof client>[0], status: number, message?: RegExp, code?: string) => {
    const error = await identify(client(answer).google).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).status).toBe(status);
    if (message) expect((error as AppError).message).toMatch(message);
    expect((error as AppError).code).toBe(code);
  };

  it("refuses an account of another domain, and one with no domain (plain Gmail)", async () => {
    await refused({ token: await idToken({ hd: "other.org", email: "ann@other.org" }) }, 403, /example\.org/, "domain");
    await refused({ token: await idToken({ hd: undefined, email: "ann@gmail.com" }) }, 403, undefined, "domain");
  });

  it("refuses an email that claims the right domain but is not of that domain", async () => {
    await refused({ token: await idToken({ email: "ann@evil.org" }) }, 403, undefined, "domain");
  });

  it("refuses an unverified email", async () => {
    await refused({ token: await idToken({ email_verified: false }) }, 401, /not verified/);
  });

  it("refuses a token meant for another application, an expired one and one from another issuer", async () => {
    await refused({ token: await idToken({ aud: "somebody-else" }) }, 401);
    await refused({ token: await idToken({ exp: Math.floor(Date.now() / 1000) - 60 }) }, 401);
    await refused({ token: await idToken({ iss: "https://evil.example" }) }, 401);
  });

  it("refuses a token signed with a key that is not Google's", async () => {
    const other = await generateKeyPair("RS256");
    const forged = await new SignJWT({ email: "ann@example.org", email_verified: true, hd: "example.org" })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer("https://accounts.google.com")
      .setAudience(options.clientId)
      .setExpirationTime("10m")
      .sign(other.privateKey);
    await refused({ token: forged }, 401);
  });

  it("refuses when Google rejects the code or sends no identity", async () => {
    await refused({ status: 400 }, 401, /refused/);
    await refused({}, 401, /no identity/);
  });
});
