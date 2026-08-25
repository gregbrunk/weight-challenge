/**
 * Server-side access to the app's timezone setting. Separated from
 * `timezone.ts` so client components can share the formatting helpers without
 * pulling the database layer into the browser bundle.
 */

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
