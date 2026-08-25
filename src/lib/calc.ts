/**
 * The math layer.
 *
 * Every derived number in the app comes from this file and nowhere else, so the
 * Today screen, the Progress screen and the live preview on the Plan form can
 * never disagree with each other. Nothing here touches the database or React;
 * it is all pure functions over plain data, which is what makes it testable
 * against the original spreadsheet.
 *
 * Three deliberate departures from the spreadsheet it replaces:
 *
 *   1. Every "(Max)" statistic scans the whole plan. The sheet hardcoded row 40,
 *      so anything logged after Oct 1 silently stopped counting toward a
 *      personal best. Here the range is derived from the plan itself.
 *   2. Baselines come from the plan's starting values rather than the first row
 *      of the log, so a missed day-one weigh-in doesn't break every stat.
 *   3. Missing values are gaps, never zeros. A day with no weight is absent from
 *      the series; it does not drag a chart or an average to nothing.
 *
 * The energy model is carried over unchanged: TDEE is treated as RMR + active
 * calories, with no allowance for NEAT or the thermic effect of food. That is
 * deliberately conservative.
 */

import { addDays, compareDates, daysBetween, type PlainDate } from "./date";

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/** The five inputs plus the baseline measurements, as configured on the Plan screen. */
export interface PlanInput {
  startDate: PlainDate;
  days: number;
  rmr: number;
  targetActiveCals: number;
  lbsToLose: number;
  /** Calories per pound of fat. 3500 by convention; configurable but rarely changed. */
  calsPerLb: number;
  startWeight: number | null;
  /** Stored as a fraction (0.299), displayed as a percentage (29.9%). */
  startBodyFat: number | null;
  startVo2Max: number | null;
  startSystolic: number | null;
  startDiastolic: number | null;
}

/** One day's log. Every measurement is optional and arrives on its own schedule. */
export interface EntryInput {
  date: PlainDate;
  weight: number | null;
  bodyFat: number | null;
  vo2Max: number | null;
  systolic: number | null;
  diastolic: number | null;
  consumedCals: number | null;
  activeCals: number | null;
}

// ---------------------------------------------------------------------------
// Plan targets
// ---------------------------------------------------------------------------

export interface PlanTargets {
  /** Total calories that must be burned over the life of the plan. */
  totalDeficitTarget: number;
  /** The daily deficit required to finish on time. */
  necessaryDailyDeficit: number;
  /** The daily food ceiling implied by the deficit and the exercise target. */
  allowedFoodCals: number;
  /** The daily exercise floor, echoed from the plan for symmetry with food. */
  targetActiveCals: number;
  /** Goal weight, or null when no starting weight was recorded. */
  targetWeight: number | null;
  /** Last day of the plan, inclusive. */
  endDate: PlainDate;
}

export function planTargets(plan: PlanInput): PlanTargets {
  const totalDeficitTarget = plan.lbsToLose * plan.calsPerLb;
  const necessaryDailyDeficit = totalDeficitTarget / plan.days;

  return {
    totalDeficitTarget,
    necessaryDailyDeficit,
    // Equivalent to the spreadsheet's O10, written the way you'd actually
    // explain it: eat what you burn, minus the deficit you owe.
    allowedFoodCals: plan.rmr + plan.targetActiveCals - necessaryDailyDeficit,
    targetActiveCals: plan.targetActiveCals,
    targetWeight:
      plan.startWeight === null ? null : plan.startWeight - plan.lbsToLose,
    endDate: addDays(plan.startDate, plan.days - 1),
  };
}

// ---------------------------------------------------------------------------
// A single day
// ---------------------------------------------------------------------------

export interface DayMetrics {
  date: PlainDate;
  /** 1-based day number within the plan. */
  dayNumber: number;
  /**
   * (RMR + active) − consumed. Null until calories are logged, because a day
   * with no food entered is unlogged, not a perfect day.
   */
  dailyDeficit: number | null;
  /** How far above or below the required daily deficit. Positive is ahead. */
  deficitToPlan: number | null;
  /** Calories left under the food ceiling. Negative means over. */
  foodRemaining: number | null;
  /** Calories still to burn to reach the exercise floor. Negative means past it. */
  activeShortfall: number | null;
  hitFoodGoal: boolean | null;
  hitActiveGoal: boolean | null;
  hitDeficitGoal: boolean | null;
  /** True once any field at all has been filled in. */
  hasAnyData: boolean;
}

export function dayMetrics(
  plan: PlanInput,
  entry: EntryInput,
  targets: PlanTargets = planTargets(plan),
): DayMetrics {
  // Mirrors the spreadsheet: an empty active-calorie cell reads as zero rather
  // than voiding the day, so logging food alone still yields a (conservative)
  // deficit.
  const active = entry.activeCals ?? 0;
  const consumed = entry.consumedCals;

  const dailyDeficit = consumed === null ? null : plan.rmr + active - consumed;
  const deficitToPlan =
    dailyDeficit === null ? null : dailyDeficit - targets.necessaryDailyDeficit;

  return {
    date: entry.date,
    dayNumber: daysBetween(plan.startDate, entry.date) + 1,
    dailyDeficit,
    deficitToPlan,
    foodRemaining: consumed === null ? null : targets.allowedFoodCals - consumed,
    activeShortfall:
      entry.activeCals === null ? null : targets.targetActiveCals - entry.activeCals,
    hitFoodGoal: consumed === null ? null : consumed <= targets.allowedFoodCals,
    hitActiveGoal:
      entry.activeCals === null
        ? null
        : entry.activeCals >= targets.targetActiveCals,
    hitDeficitGoal: deficitToPlan === null ? null : deficitToPlan >= 0,
    hasAnyData: hasAnyData(entry),
  };
}

export function hasAnyData(entry: EntryInput): boolean {
  return (
    entry.weight !== null ||
    entry.bodyFat !== null ||
    entry.vo2Max !== null ||
    entry.systolic !== null ||
    entry.diastolic !== null ||
    entry.consumedCals !== null ||
    entry.activeCals !== null
  );
}

// ---------------------------------------------------------------------------
// Measurement series
// ---------------------------------------------------------------------------

/** A metric's baseline, where it stands now, and its best reading so far. */
export interface MetricProgress {
  baseline: number | null;
  latest: number | null;
  /** The reading representing the best result, best being direction-dependent. */
  best: number | null;
  /** Improvement as of the most recent reading. Positive is always good. */
  current: number | null;
  /** Improvement at the best point ever reached. Positive is always good. */
  max: number | null;
  /** How far the current reading has slipped from the best one. Never negative. */
  offBest: number | null;
  count: number;
}

type Direction = "down" | "up";

function metricProgress(
  baseline: number | null,
  values: readonly number[],
  direction: Direction,
): MetricProgress {
  // The baseline participates in the best-ever pool, so a plan can never report
  // a negative personal best just because you haven't improved yet.
  const pool = baseline === null ? [...values] : [baseline, ...values];
  const latest = values.length > 0 ? values[values.length - 1] : null;
  const best =
    pool.length === 0
      ? null
      : direction === "down"
        ? Math.min(...pool)
        : Math.max(...pool);

  const improvement = (value: number | null): number | null => {
    if (baseline === null || value === null) return null;
    return direction === "down" ? baseline - value : value - baseline;
  };

  const current = improvement(latest);
  const max = improvement(best);

  return {
    baseline,
    latest,
    best,
    current,
    max,
    offBest: current === null || max === null ? null : Math.max(0, max - current),
    count: values.length,
  };
}

/** One plotted point. Only days that actually carry the metric appear. */
export interface SeriesPoint {
  date: PlainDate;
  dayNumber: number;
  value: number;
}

export function series(
  plan: PlanInput,
  entries: readonly EntryInput[],
  pick: (entry: EntryInput) => number | null,
): SeriesPoint[] {
  return sortByDate(entries).flatMap((entry) => {
    const value = pick(entry);
    return value === null
      ? []
      : [
          {
            date: entry.date,
            dayNumber: daysBetween(plan.startDate, entry.date) + 1,
            value,
          },
        ];
  });
}

function sortByDate(entries: readonly EntryInput[]): EntryInput[] {
  return [...entries].sort((a, b) => compareDates(a.date, b.date));
}

// ---------------------------------------------------------------------------
// Whole-plan progress
// ---------------------------------------------------------------------------

export interface PlanProgress {
  targets: PlanTargets;
  /** Days from the start through `asOf`, clamped to the plan's length. */
  dayNumber: number;
  daysElapsed: number;
  daysRemaining: number;
  /** Calories banked so far — the sum of every logged daily deficit. */
  deficitBanked: number;
  /** Target minus banked. Counts down toward zero. */
  deficitRemaining: number;
  /** Share of the total deficit target already banked, 0–1 and uncapped above. */
  deficitProgress: number;
  /** Cumulative ahead/behind pace. The spreadsheet's "Deficit to Plan". */
  cumulativeToPlan: number;
  /** Days with calories logged. The denominator for the average below. */
  daysLogged: number;
  averageDailyDeficit: number | null;
  /** Where the current average lands you by the end date, in pounds lost. */
  projectedLbsLost: number | null;
  projectedEndWeight: number | null;
  /** Deficit still required per remaining day to finish on target. */
  requiredDailyDeficitFromHere: number | null;
  weight: MetricProgress;
  bodyFat: MetricProgress;
  vo2Max: MetricProgress;
  systolic: MetricProgress;
  diastolic: MetricProgress;
  /** Pounds lost per the scale, as distinct from pounds implied by the deficit. */
  lbsLostByScale: number | null;
  /** Pounds implied by calories banked. Rarely agrees with the scale; that's fine. */
  lbsLostByDeficit: number;
}

export function planProgress(
  plan: PlanInput,
  entries: readonly EntryInput[],
  asOf: PlainDate,
): PlanProgress {
  const targets = planTargets(plan);
  const sorted = sortByDate(entries);
  const withinPlan = sorted.filter(
    (entry) => entry.date >= plan.startDate && entry.date <= targets.endDate,
  );

  const elapsed = clamp(daysBetween(plan.startDate, asOf) + 1, 0, plan.days);
  const daysRemaining = plan.days - elapsed;

  const daily = withinPlan.map((entry) => dayMetrics(plan, entry, targets));
  const logged = daily.filter((d) => d.dailyDeficit !== null);

  const deficitBanked = logged.reduce((sum, d) => sum + (d.dailyDeficit ?? 0), 0);
  const cumulativeToPlan = logged.reduce(
    (sum, d) => sum + (d.deficitToPlan ?? 0),
    0,
  );
  const deficitRemaining = targets.totalDeficitTarget - deficitBanked;

  const averageDailyDeficit =
    logged.length > 0 ? deficitBanked / logged.length : null;

  // Project by carrying the current average across every remaining day. With no
  // logged days there is nothing to extrapolate from, so this stays null rather
  // than quietly assuming zero.
  const projectedTotalDeficit =
    averageDailyDeficit === null
      ? null
      : deficitBanked + averageDailyDeficit * daysRemaining;
  const projectedLbsLost =
    projectedTotalDeficit === null
      ? null
      : projectedTotalDeficit / plan.calsPerLb;

  const values = <T>(pick: (entry: EntryInput) => T | null): T[] =>
    withinPlan.flatMap((entry) => {
      const value = pick(entry);
      return value === null ? [] : [value];
    });

  const weight = metricProgress(plan.startWeight, values((e) => e.weight), "down");

  return {
    targets,
    dayNumber: elapsed,
    daysElapsed: elapsed,
    daysRemaining,
    deficitBanked,
    deficitRemaining,
    deficitProgress:
      targets.totalDeficitTarget === 0
        ? 0
        : deficitBanked / targets.totalDeficitTarget,
    cumulativeToPlan,
    daysLogged: logged.length,
    averageDailyDeficit,
    projectedLbsLost,
    projectedEndWeight:
      plan.startWeight === null || projectedLbsLost === null
        ? null
        : plan.startWeight - projectedLbsLost,
    requiredDailyDeficitFromHere:
      daysRemaining <= 0 ? null : Math.max(0, deficitRemaining) / daysRemaining,
    weight,
    bodyFat: metricProgress(plan.startBodyFat, values((e) => e.bodyFat), "down"),
    vo2Max: metricProgress(plan.startVo2Max, values((e) => e.vo2Max), "up"),
    systolic: metricProgress(plan.startSystolic, values((e) => e.systolic), "down"),
    diastolic: metricProgress(
      plan.startDiastolic,
      values((e) => e.diastolic),
      "down",
    ),
    lbsLostByScale: weight.current,
    lbsLostByDeficit: deficitBanked / plan.calsPerLb,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
