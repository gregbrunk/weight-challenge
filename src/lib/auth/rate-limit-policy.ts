/**
 * How hard to slow an attacker down, as pure arithmetic.
 *
 * Client-safe by construction: no database, no `node:` APIs, no `server-only`.
 * The policy is separated from the storage so the numbers below can be tested
 * without a database, the same split as `timezone.ts` beside
 * `timezone-server.ts`.
 *
 * Why this exists at all: the unlock action used to rely on scrypt's cost —
 * roughly 100ms per attempt — as the only brake. That reasoning holds for one
 * attacker running one guess at a time, and falls apart against fifty parallel
 * requests, which is about 500 guesses a second and tens of millions a day. It
 * also assumed a counter "wouldn't survive across serverless instances", which
 * was true of an in-memory counter and untrue here: this app has a single
 * shared Postgres database, and a row in it survives everything.
 */

/** Wrong answers allowed before the door starts closing. */
export const FREE_ATTEMPTS = 5;

/** The first lockout, doubling with each further failure. */
export const BASE_LOCK_SECONDS = 60;

/**
 * The ceiling. An hour is long enough that guessing is hopeless — about 24
 * tries a day — and short enough that locking yourself out is an annoyance
 * rather than a lost evening.
 */
export const MAX_LOCK_SECONDS = 60 * 60;

/**
 * How long a quiet spell has to be before the count is forgiven.
 *
 * Without this, five typos spread over a month would eventually lock the app
 * on an honest mistake.
 */
export const ATTEMPT_WINDOW_SECONDS = 15 * 60;

/**
 * Seconds to lock after `failures` consecutive wrong answers.
 *
 * Progressive rather than a flat ban: the first few mistakes are free because
 * they are almost always typos, and the cost then doubles, so an attacker
 * reaches an hour between guesses after eleven of them while a real person who
 * fumbles twice notices nothing at all.
 */
export function lockSecondsFor(failures: number): number {
  if (failures <= FREE_ATTEMPTS) return 0;

  const doublings = failures - FREE_ATTEMPTS - 1;

  // Guard the shift before it happens: 2 ** 1024 is Infinity, and
  // Infinity * BASE would poison the Math.min below rather than clamp.
  if (doublings >= 32) return MAX_LOCK_SECONDS;

  return Math.min(BASE_LOCK_SECONDS * 2 ** doublings, MAX_LOCK_SECONDS);
}

/**
 * Whether a run of failures is old enough to forget.
 *
 * Measured from the *first* failure in the run, not the last, so an attacker
 * cannot hold the window open forever by pacing guesses just under the limit —
 * the run ages out regardless and the count starts again from a clean slate,
 * which is the intent. The lockout is what does the slowing; the window only
 * decides when honest typos are forgiven.
 */
export function windowHasExpired(firstFailureAt: Date, now: Date): boolean {
  return now.getTime() - firstFailureAt.getTime() > ATTEMPT_WINDOW_SECONDS * 1000;
}

/** Whole seconds still to wait, or 0 when the door is open. */
export function secondsRemaining(lockedUntil: Date | null, now: Date): number {
  if (!lockedUntil) return 0;
  return Math.max(0, Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000));
}

/**
 * "in 2 minutes" — for the one message this screen is allowed to be specific
 * about. It says nothing about whether the password was close.
 */
export function describeWait(seconds: number): string {
  if (seconds <= 1) return "in a moment";
  if (seconds < 60) return `in ${seconds} seconds`;

  // Each unit is rounded up from the seconds directly rather than from the
  // unit below it. Rounding up twice compounds: 3601s becomes 61 minutes and
  // then 2 hours, promising a wait an hour longer than the real one.
  if (seconds < MAX_LOCK_SECONDS) {
    const minutes = Math.ceil(seconds / 60);
    return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;
  }

  const hours = Math.ceil(seconds / 3600);
  return `in ${hours} hour${hours === 1 ? "" : "s"}`;
}
