/**
 * Session tokens.
 *
 * A session is a signed JWT in an HTTP-only cookie. It carries no identity —
 * there is only one user — just an expiry and a session epoch, so changing the
 * password can invalidate every outstanding session at once.
 *
 * The expiry is *sliding*: fifteen minutes of inactivity, refreshed on every
 * authenticated request. A hard fifteen-minute cap would lock the app mid-entry
 * while you were typing the evening's numbers.
 *
 * Uses `jose`, which runs in the Edge runtime, so middleware can verify a
 * session without a database round trip on every navigation.
 */

import { jwtVerify, SignJWT, type JWTPayload } from "jose";

export const SESSION_COOKIE = "wca_session";

/** Fifteen minutes of inactivity, in seconds. */
export const SESSION_TTL_SECONDS = 15 * 60;

/**
 * Refresh the cookie only once the session is more than a minute old. Without
 * this, every request on a busy screen would mint and set a new token.
 */
export const SESSION_REFRESH_AFTER_SECONDS = 60;

export interface SessionPayload extends JWTPayload {
  /** Matches Setting.sessionEpoch. A mismatch means the password changed. */
  epoch: number;
}

function secret(): Uint8Array {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error(
      "SESSION_SECRET is missing or too short. Set a random 32+ character value in .env.local.",
    );
  }
  return new TextEncoder().encode(value);
}

export async function createSessionToken(epoch: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({ epoch })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + SESSION_TTL_SECONDS)
    .sign(secret());
}

/** Returns the payload, or null for any token that is absent, invalid or expired. */
export async function readSessionToken(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify<SessionPayload>(token, secret(), {
      algorithms: ["HS256"],
    });
    return typeof payload.epoch === "number" ? payload : null;
  } catch {
    // Expired, tampered with, or signed by a previous SESSION_SECRET.
    return null;
  }
}

/** True once the token is old enough to be worth reissuing. */
export function shouldRefresh(payload: SessionPayload): boolean {
  const issuedAt = payload.iat;
  if (typeof issuedAt !== "number") return true;

  const age = Math.floor(Date.now() / 1000) - issuedAt;
  return age >= SESSION_REFRESH_AFTER_SECONDS;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}
