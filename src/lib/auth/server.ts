/**
 * Server-side session handling.
 *
 * Two layers guard the app, deliberately:
 *
 *   1. The proxy (src/proxy.ts) verifies the token's signature and expiry on
 *      every request. It runs at the edge with no database access, so it is
 *      fast and catches the common case — no cookie, or an expired one.
 *   2. This module additionally checks the token's epoch against the database.
 *      That catches a session issued before a password change, which the proxy
 *      alone cannot see.
 *
 * Pages and server actions call `requireAuth()`. Nothing should read the cookie
 * directly.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionEpoch } from "@/lib/settings";
import {
  createSessionToken,
  readSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "./session";

/** Returns true when the caller holds a valid, current session. */
export async function hasValidSession(): Promise<boolean> {
  const store = await cookies();
  const payload = await readSessionToken(store.get(SESSION_COOKIE)?.value);
  if (!payload) return false;

  // A session minted before the last password change is no longer good.
  return payload.epoch === (await getSessionEpoch());
}

/**
 * Guards a page or server action. Redirects to the unlock screen when the
 * session is missing, expired or stale.
 *
 * `returnTo` is carried through so unlocking lands you back where you were
 * rather than dumping you on the home screen.
 */
export async function requireAuth(returnTo?: string): Promise<void> {
  if (await hasValidSession()) return;

  const target = returnTo ? `/unlock?next=${encodeURIComponent(returnTo)}` : "/unlock";
  redirect(target);
}

/** Issues a fresh session cookie. Call only after verifying the password. */
export async function startSession(): Promise<void> {
  const epoch = await getSessionEpoch();
  const store = await cookies();

  store.set(SESSION_COOKIE, await createSessionToken(epoch), sessionCookieOptions());
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
