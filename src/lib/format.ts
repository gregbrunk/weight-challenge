/**
 * Display formatting.
 *
 * Two rules run through all of it. Missing data renders as an em dash, never as
 * zero — "—" means you haven't weighed in, "0.0" would mean you weigh nothing.
 * And any number that represents progress carries an explicit sign, because
 * "−1.4 lb" and "1.4 lb" mean opposite things on a weight-loss screen.
 */

export const EM_DASH = "—";

const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatCalories(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EM_DASH;
  return integer.format(Math.round(value));
}

export function formatWeight(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EM_DASH;
  return oneDecimal.format(value);
}

/** Takes a fraction (0.299) and renders a percentage (29.9%). */
export function formatBodyFat(fraction: number | null | undefined): string {
  if (fraction === null || fraction === undefined || Number.isNaN(fraction)) {
    return EM_DASH;
  }
  return `${oneDecimal.format(fraction * 100)}%`;
}

export function formatVo2(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EM_DASH;
  return oneDecimal.format(value);
}

export function formatBloodPressure(
  systolic: number | null | undefined,
  diastolic: number | null | undefined,
): string {
  if (systolic === null || systolic === undefined) return EM_DASH;
  if (diastolic === null || diastolic === undefined) return EM_DASH;
  return `${systolic}/${diastolic}`;
}

/** Signed to one decimal: "+1.4", "−0.6", "0.0". Uses a real minus sign. */
export function formatSigned(
  value: number | null | undefined,
  decimals: 0 | 1 = 1,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EM_DASH;

  const formatter = decimals === 0 ? integer : oneDecimal;
  const rounded = decimals === 0 ? Math.round(value) : value;

  if (rounded > 0) return `+${formatter.format(rounded)}`;
  if (rounded < 0) return `−${formatter.format(Math.abs(rounded))}`;
  return formatter.format(0);
}

/** Signed calories, rounded: "+312 cal", "−88 cal". */
export function formatSignedCalories(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EM_DASH;
  return formatSigned(value, 0);
}

export function formatPercent(
  fraction: number | null | undefined,
  decimals: 0 | 1 = 0,
): string {
  if (fraction === null || fraction === undefined || Number.isNaN(fraction)) {
    return EM_DASH;
  }
  const formatter = decimals === 0 ? integer : oneDecimal;
  return `${formatter.format(fraction * 100)}%`;
}

/** "3 days", "1 day" — spelled out so a bare number never floats unlabelled. */
export function formatDays(count: number): string {
  return `${integer.format(count)} ${count === 1 ? "day" : "days"}`;
}

/** Strips a trailing ".0" so inputs don't show "232.0" when you typed "232". */
export function numberToInputValue(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  return String(value);
}

/**
 * "16h 26m" — a finished fast's length.
 *
 * Minutes are rounded rather than truncated, so a fast two seconds short of
 * seventeen hours doesn't read as 16h 59m while the goal says it was met.
 */
export function formatDuration(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || Number.isNaN(hours)) return EM_DASH;

  const totalMinutes = Math.round(Math.max(hours, 0) * 60);
  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
}

/**
 * "8:30:01" — a running timer, counting whole seconds.
 *
 * Hours are not padded and are never wrapped at 24: a timer that reset to zero
 * a day into a fast would be actively misleading.
 */
export function formatClock(ms: number): string {
  const totalSeconds = Math.max(Math.floor(ms / 1000), 0);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
