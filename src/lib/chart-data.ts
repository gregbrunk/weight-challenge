/**
 * Turning logged days into plottable rows.
 *
 * The important decision here is that a day with no reading becomes a row with
 * a null value, not a missing row. Charts are then told not to connect across
 * nulls, so a week you didn't weigh in shows as a gap in the line rather than a
 * straight segment implying steady progress you never measured.
 *
 * Rows run from the plan's first day to today, never to the plan's end — a
 * chart that reserves two thirds of its width for days that haven't happened
 * makes the part you care about unreadably small.
 */

import type { EntryInput, PlanInput } from "./calc";
import { addDays, compareDates, daysBetween, formatShort, type PlainDate } from "./date";

export interface ChartRow {
  /** 1-based day within the plan. The x axis. */
  day: number;
  date: PlainDate;
  /** "Aug 25", for axis ticks and tooltips. */
  label: string;
  weight: number | null;
  /** Percentage points (29.9), not the stored fraction. */
  bodyFat: number | null;
  vo2Max: number | null;
  systolic: number | null;
  diastolic: number | null;
  /** Where the weight should be on this day to finish on target. */
  weightGoal: number | null;
}

/**
 * One row per day from the plan's start through `upTo`, clamped to the plan.
 *
 * `upTo` is normally today. A plan that has finished renders in full; one that
 * hasn't started yet renders a single day rather than nothing, so the chart
 * frame still appears instead of collapsing.
 */
export function buildChartRows(
  plan: PlanInput,
  entries: readonly EntryInput[],
  upTo: PlainDate,
): ChartRow[] {
  const lastPlanDay = addDays(plan.startDate, plan.days - 1);
  const end = clampDate(upTo, plan.startDate, lastPlanDay);
  const dayCount = daysBetween(plan.startDate, end) + 1;

  const byDate = new Map<PlainDate, EntryInput>();
  for (const entry of entries) byDate.set(entry.date, entry);

  return Array.from({ length: dayCount }, (_, index) => {
    const date = addDays(plan.startDate, index);
    const entry = byDate.get(date);

    return {
      day: index + 1,
      date,
      label: formatShort(date),
      weight: entry?.weight ?? null,
      // Stored as a fraction, plotted as a percentage.
      bodyFat: entry?.bodyFat == null ? null : entry.bodyFat * 100,
      vo2Max: entry?.vo2Max ?? null,
      systolic: entry?.systolic ?? null,
      diastolic: entry?.diastolic ?? null,
      weightGoal: goalWeightOn(plan, index),
    };
  });
}

/**
 * The straight line from starting weight to target across the plan's length.
 *
 * Real weight loss isn't linear, and this line isn't a prediction — it's the
 * pace that finishes on time, so you can see whether you're above or below it.
 */
function goalWeightOn(plan: PlanInput, dayIndex: number): number | null {
  if (plan.startWeight === null) return null;
  if (plan.days <= 1) return plan.startWeight - plan.lbsToLose;

  const fraction = dayIndex / (plan.days - 1);
  return plan.startWeight - plan.lbsToLose * fraction;
}

function clampDate(value: PlainDate, min: PlainDate, max: PlainDate): PlainDate {
  if (compareDates(value, min) < 0) return min;
  if (compareDates(value, max) > 0) return max;
  return value;
}

/**
 * A padded [min, max] for an axis, given every value that will be drawn.
 *
 * Charts default to a domain that hugs the data, which makes a two-pound
 * change look like a cliff. Padding by a share of the range, with a floor for
 * near-flat data, keeps the shape honest.
 */
export function paddedDomain(
  values: readonly (number | null)[],
  options: { padding?: number; minSpan?: number } = {},
): [number, number] | null {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) return null;

  const { padding = 0.12, minSpan = 1 } = options;
  const low = Math.min(...present);
  const high = Math.max(...present);
  const span = Math.max(high - low, minSpan);
  const pad = span * padding;

  return [round(low - pad), round(high + pad)];
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/** True when a series has at least one reading and is worth drawing at all. */
export function hasData(
  rows: readonly ChartRow[],
  key: keyof Pick<ChartRow, "weight" | "bodyFat" | "vo2Max" | "systolic" | "diastolic">,
): boolean {
  return rows.some((row) => row[key] !== null);
}

/**
 * Roughly six ticks, whatever the plan's length — every day labelled is
 * unreadable at 93 days and on a phone.
 */
export function tickInterval(rowCount: number, target = 6): number {
  return Math.max(0, Math.ceil(rowCount / target) - 1);
}
