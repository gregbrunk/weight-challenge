/**
 * Plain-date helpers.
 *
 * Every date in this app is a calendar day, never an instant. "2026-08-25" is
 * the day you stepped on the scale, regardless of what timezone you were in or
 * what time the browser thinks it is. We store and pass dates as `YYYY-MM-DD`
 * strings and only ever convert to `Date` at UTC noon, which keeps arithmetic
 * away from DST boundaries in both directions.
 */

export type PlainDate = string; // YYYY-MM-DD

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isPlainDate(value: unknown): value is PlainDate {
  return typeof value === "string" && DATE_RE.test(value);
}

/** Parse a plain date to a `Date` fixed at UTC noon. */
export function toUtcNoon(date: PlainDate): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
}

export function fromUtcNoon(date: Date): PlainDate {
  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

/** Today as seen by the user's own clock, not the server's. */
export function today(now: Date = new Date()): PlainDate {
  return [
    String(now.getFullYear()).padStart(4, "0"),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

export function addDays(date: PlainDate, days: number): PlainDate {
  const d = toUtcNoon(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtcNoon(d);
}

/** Whole days from `from` to `to`. Negative when `to` precedes `from`. */
export function daysBetween(from: PlainDate, to: PlainDate): number {
  const ms = toUtcNoon(to).getTime() - toUtcNoon(from).getTime();
  return Math.round(ms / 86_400_000);
}

export function compareDates(a: PlainDate, b: PlainDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Every day of a plan, inclusive of the first and last. */
export function dateRange(start: PlainDate, days: number): PlainDate[] {
  return Array.from({ length: days }, (_, i) => addDays(start, i));
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Aug 25" — the compact form used in headers and chart axes. */
export function formatShort(date: PlainDate): string {
  const d = toUtcNoon(date);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "Tue, Aug 25" — the form used on the date navigator. */
export function formatWithWeekday(date: PlainDate): string {
  const d = toUtcNoon(date);
  return `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "Aug 25, 2026" — the form used for plan start/end dates. */
export function formatLong(date: PlainDate): string {
  const d = toUtcNoon(date);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
