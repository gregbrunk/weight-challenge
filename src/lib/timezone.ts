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

// ---------------------------------------------------------------------------
// Wall-clock times
// ---------------------------------------------------------------------------
//
// Fasting is the first thing in this app that cares what *time* it is, not just
// what day. A fast start and end are stored as true instants so the duration
// between them survives a daylight-saving change, but they are entered and read
// as wall-clock times in the app's zone — "6:30 PM" is what you remember, not
// an offset from UTC. These convert between the two.

/** Minutes since midnight, the form a time input works in. */
export type MinutesOfDay = number;

export const MINUTES_PER_DAY = 1440;

function zonedParts(
  instant: Date,
  timeZone: string,
): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  // `hourCycle: "h23"` rather than `hour12: false`: the latter reports midnight
  // as hour 24 on some ICU builds, which would push every conversion a day out.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

/**
 * A zone's offset from UTC at a given instant, in milliseconds.
 *
 * Derived by asking Intl what the wall clock reads there and comparing it to
 * the same reading interpreted as UTC. That makes it correct across daylight
 * saving without carrying a timezone database around.
 */
export function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = zonedParts(instant, timeZone);
  const asIfUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  // The formatted parts have no milliseconds, so compare against a whole second.
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

const DAY_MS = 86_400_000;

/**
 * The instant at which a zone's clock reads `minutes` past midnight on `date`.
 *
 * Most of the year one offset applies and there is a single answer. Twice a
 * year there isn't, and rather than let the arithmetic pick by accident, both
 * candidate offsets are tried and the conventional reading chosen:
 *
 *   - **A time the spring-forward skips** — 2:30am on a morning where 2am
 *     becomes 3am — resolves forward, to the instant the clock jumps to. The
 *     naive approach silently resolves it an hour *backwards* instead, to
 *     1:30am, which is a time you did not ask for on the wrong side of the gap.
 *   - **A time the autumn fall-back repeats** resolves to the first of the two,
 *     which is the one a person means by it.
 *
 * Neither case throws: this converts a time somebody typed, and refusing to
 * store an hour that a calendar quirk made strange would be worse than picking.
 *
 * The offsets are sampled a day either side of the target, which is far enough
 * from any transition to read cleanly and far closer than any two transitions
 * ever are to each other.
 */
export function instantFromZonedTime(
  date: PlainDate,
  minutes: MinutesOfDay,
  timeZone: string,
): Date {
  const [year, month, day] = date.split("-").map(Number);
  const wallAsUtc = Date.UTC(year, month - 1, day) + minutes * 60_000;

  const before = wallAsUtc - zoneOffsetMs(new Date(wallAsUtc - DAY_MS), timeZone);
  const after = wallAsUtc - zoneOffsetMs(new Date(wallAsUtc + DAY_MS), timeZone);

  // Whichever candidate actually reads back as the time asked for. In the
  // ordinary case both do and they are the same instant.
  const reads = (candidate: number): boolean => {
    const instant = new Date(candidate);
    return (
      zonedMinutesOf(instant, timeZone) === minutes &&
      zonedDateOf(instant, timeZone) === date
    );
  };

  if (reads(before)) return new Date(before);
  if (reads(after)) return new Date(after);

  // Neither reads back, so the time falls in a gap. `before` uses the offset
  // from ahead of the transition, which lands past it — the forward shift.
  return new Date(before);
}

/** What the zone's clock reads at an instant, as minutes since midnight. */
export function zonedMinutesOf(instant: Date, timeZone: string): MinutesOfDay {
  const parts = zonedParts(instant, timeZone);
  return parts.hour * 60 + parts.minute;
}

/** The calendar day an instant falls on in a zone. */
export function zonedDateOf(instant: Date, timeZone: string): PlainDate {
  return todayInZone(timeZone, instant);
}

/** "6:30 PM" — how a logged fast time reads on screen. */
export function formatTimeInZone(instant: Date, timeZone: string): string {
  return timeInZone(timeZone, instant);
}

/** "18:30" — the value an `<input type="time">` round-trips. */
export function toTimeInputValue(instant: Date, timeZone: string): string {
  return minutesToTimeInput(zonedMinutesOf(instant, timeZone));
}

export function minutesToTimeInput(minutes: MinutesOfDay): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Parses "18:30" back to minutes. Null for anything that isn't a valid time. */
export function parseTimeInput(value: string): MinutesOfDay | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;

  return hour * 60 + minute;
}
