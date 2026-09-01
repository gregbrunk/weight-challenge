/**
 * Unlock attempt throttling.
 *
 * Server-only: it reaches the database and `node:crypto`. Importing it from a
 * client component is a build error, not a runtime one — which is the point.
 *
 * Counted per client rather than globally. A single global counter would let
 * anyone who can reach the unlock page lock the actual owner out by failing on
 * purpose, turning a brute-force defence into a denial-of-service button.
 */

import "server-only";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import {
  ATTEMPT_WINDOW_SECONDS,
  lockSecondsFor,
  secondsRemaining,
  windowHasExpired,
} from "./rate-limit-policy";

/**
 * Identifies the caller without storing who they are.
 *
 * The address is HMAC'd with the session secret and only the digest is written,
 * so the table cannot be read back into a list of visitor IPs — which matters
 * more now the repository is public and the schema is visible.
 *
 * Vercel sets `x-forwarded-for`; the leftmost entry is the client and the rest
 * are proxies. Locally there is no such header, so every request shares one
 * bucket, which is correct: a single developer machine is a single client.
 */
export async function clientKey(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for") ?? "";
  const address = forwarded.split(",")[0]?.trim() || headerList.get("x-real-ip") || "local";

  const secret = process.env.SESSION_SECRET ?? "";
  return createHmac("sha256", secret).update(address).digest("hex");
}

export interface Throttle {
  allowed: boolean;
  /** Whole seconds until the next attempt is permitted. */
  retryAfterSeconds: number;
}

const LOCKED: Throttle = { allowed: false, retryAfterSeconds: 0 };

/** Whether this client may try right now. */
export async function checkUnlockThrottle(key: string): Promise<Throttle> {
  const row = await prisma.unlockAttempt.findUnique({ where: { clientKey: key } });
  if (!row) return { allowed: true, retryAfterSeconds: 0 };

  const remaining = secondsRemaining(row.lockedUntil, new Date());
  return remaining > 0
    ? { ...LOCKED, retryAfterSeconds: remaining }
    : { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Records a wrong password and returns the resulting lock.
 *
 * A run that has gone quiet for longer than the window starts again from one,
 * so a handful of typos spread over weeks never accumulates into a lockout.
 */
export async function recordUnlockFailure(key: string): Promise<Throttle> {
  const now = new Date();
  const existing = await prisma.unlockAttempt.findUnique({ where: { clientKey: key } });

  const continuing =
    existing !== null &&
    !(windowHasExpired(existing.firstFailureAt, now) && secondsRemaining(existing.lockedUntil, now) === 0);

  const failures = continuing ? existing.failures + 1 : 1;
  const lockSeconds = lockSecondsFor(failures);
  const lockedUntil = lockSeconds > 0 ? new Date(now.getTime() + lockSeconds * 1000) : null;

  await prisma.unlockAttempt.upsert({
    where: { clientKey: key },
    create: { clientKey: key, failures, firstFailureAt: now, lockedUntil },
    update: {
      failures,
      firstFailureAt: continuing ? existing.firstFailureAt : now,
      lockedUntil,
    },
  });

  return lockSeconds > 0
    ? { ...LOCKED, retryAfterSeconds: lockSeconds }
    : { allowed: true, retryAfterSeconds: 0 };
}

/** The right password wipes the slate for that client. */
export async function clearUnlockFailures(key: string): Promise<void> {
  await prisma.unlockAttempt.deleteMany({ where: { clientKey: key } });
}

/**
 * Drops rows nothing is waiting on, so the table cannot grow without bound
 * from an attacker rotating addresses. Called on success, which is rare enough
 * to be a fine moment for housekeeping and never on the path being attacked.
 */
export async function pruneUnlockAttempts(): Promise<void> {
  const cutoff = new Date(Date.now() - ATTEMPT_WINDOW_SECONDS * 1000);

  await prisma.unlockAttempt.deleteMany({
    where: {
      updatedAt: { lt: cutoff },
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date() } }],
    },
  });
}
