import { jwtVerify, SignJWT } from "jose";

// Two kinds of short-lived signed tokens, told apart by their audience so one can never be used
// as the other:
//   session  the proof of being signed in, in a cookie, valid for 24 hours;
//   login    what we remember between sending someone to Google and getting them back.

const SESSION_AUDIENCE = "erp-session";
const LOGIN_AUDIENCE = "erp-login";

export const SESSION_HOURS = 24;

/** The session token carries only the user id: role and areas are read from the database on each request. */
export function signSessionToken(userId: number, secret: Uint8Array): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(userId))
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secret);
}

/** The user id of a valid, unexpired session token, or null. */
export async function verifySessionToken(token: string, secret: Uint8Array): Promise<number | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"], audience: SESSION_AUDIENCE });
    const id = Number(payload.sub);
    return Number.isInteger(id) ? id : null;
  } catch {
    return null;
  }
}

export interface LoginState {
  state: string;
  verifier: string;
}

export function signLoginState(value: LoginState, secret: Uint8Array): Promise<string> {
  return new SignJWT({ ...value })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(LOGIN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secret);
}

export async function verifyLoginState(token: string, secret: Uint8Array): Promise<LoginState | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"], audience: LOGIN_AUDIENCE });
    const { state, verifier } = payload;
    return typeof state === "string" && typeof verifier === "string" ? { state, verifier } : null;
  } catch {
    return null;
  }
}
