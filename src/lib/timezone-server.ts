/**
 * Server-side access to the app's timezone setting. Separated from
 * `timezone.ts` so client components can share the formatting helpers without
 * pulling the database layer into the browser bundle.
 */

// Importing this from a client component is a build error, not a runtime
// one — which is the point. Three separate bugs in this project were a
// client component pulling a server module in through a shared constant.
import "server-only";

import type { PlainDate } from "./date";
import { getSettings } from "./settings";
import { DEFAULT_TIME_ZONE, isValidTimeZone, todayInZone } from "./timezone";

/**
 * The configured timezone, falling back to the default if the stored value is
 * one this runtime doesn't recognise — a zone can be dropped from the IANA
 * database, and an unknown one would otherwise throw inside Intl.
 */
export async function getTimeZone(): Promise<string> {
  const { timeZone } = await getSettings();
  return isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
}

/** Today's date in the app's configured timezone. */
export async function getToday(): Promise<PlainDate> {
  return todayInZone(await getTimeZone());
}

/**
 * The current instant, read once per request.
 *
 * Trivial, and deliberately here rather than at a call site. Everything in this
 * app that asks what time it is asks this module, so a screen can't quietly
 * grow its own clock — and a server component reading `Date.now()` in its own
 * body is an impure call during render, which is exactly the kind of thing that
 * renders inconsistently when React re-runs it.
 */
export async function getNow(): Promise<Date> {
  return new Date();
}
