/**
 * Knowing what day it is.
 *
 * The server has no idea what day it is *for you*. On Vercel it runs in UTC, so
 * at 6pm Mountain it already believes it's tomorrow — which would file an
 * evening weigh-in under the wrong date and shift every "today" in the app.
 *
 * The answer is a single app-wide setting rather than per-browser detection.
 * A plan runs on one calendar, and that calendar shouldn't change because you
 * opened the app from a hotel in another timezone: the day you log against
 * should be the day at home. Change it in Settings when home changes.
 *
 * This module is free of server-only imports so client components can share the
 * formatting helpers; reading the setting lives in `timezone-server.ts`.
 */

import type { PlainDate } from "./date";

/** Mountain Time. Overridable in Settings. */
export const DEFAULT_TIME_ZONE = "America/Denver";

/**
 * Offered first in the picker. The full IANA list is long enough that finding
 * your own zone in it is a chore, and these cover almost every real case here.
 */
export const COMMON_TIME_ZONES = [
  { id: "America/Denver", label: "Mountain Time — Denver" },
  { id: "America/Phoenix", label: "Mountain Time, no DST — Phoenix" },
  { id: "America/Los_Angeles", label: "Pacific Time — Los Angeles" },
  { id: "America/Chicago", label: "Central Time — Chicago" },
  { id: "America/New_York", label: "Eastern Time — New York" },
  { id: "America/Anchorage", label: "Alaska Time — Anchorage" },
  { id: "Pacific/Honolulu", label: "Hawaii Time — Honolulu" },
  { id: "UTC", label: "UTC" },
] as const;

export function isValidTimeZone(value: string): boolean {
  if (!value || value.length > 64) return false;

  try {
    // Throws RangeError for anything the platform doesn't recognise, which is
    // also what keeps a hand-edited value from reaching Intl as-is.
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Every zone this platform knows, for the "all time zones" group. */
export function allTimeZones(): string[] {
  // supportedValuesOf is ES2022 and present in every runtime this app targets,
  // but fall back to the common list rather than throwing if it's ever missing.
  const supported = Intl.supportedValuesOf?.("timeZone");
  return supported ? [...supported] : COMMON_TIME_ZONES.map((zone) => zone.id);
}

/** The calendar date in a given zone, as YYYY-MM-DD. */
export function todayInZone(timeZone: string, now: Date = new Date()): PlainDate {
  // "en-CA" formats as YYYY-MM-DD, which saves reassembling the parts by hand.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Wall-clock time in a zone, e.g. "3:24 PM". Used to confirm a picked zone. */
export function timeInZone(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(now);
}

/** A zone's current abbreviation, e.g. "MDT". */
export function zoneAbbreviation(timeZone: string, now: Date = new Date()): string {
  const part = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "short",
  })
    .formatToParts(now)
    .find((candidate) => candidate.type === "timeZoneName");

  return part?.value ?? "";
}

/** "Denver" out of "America/Denver", for compact display. */
export function zoneCityName(timeZone: string): string {
  const last = timeZone.split("/").pop() ?? timeZone;
  return last.replace(/_/g, " ");
}
