/**
 * Intermittent fasting.
 *
 * One idea does all the work here: **a fast is an interval spanning two days,
 * and the day it ends is the day credited with it.** You stop eating at 6:30pm
 * on Monday and hold out until 12:30pm on Tuesday; Tuesday earns the 18 hours,
 * because the morning you held out is the achievement, not the evening you
 * stopped. Every screen follows from that.
 *
 * The storage shape falls out of it. `DailyEntry` keeps one row per calendar
 * day, so each row carries two independent halves of two different fasts:
 *
 *     fastStartAt — the fast that BEGINS on this day, finished tomorrow
 *     fastEndAt   — the fast that ENDS on this day, begun yesterday
 *
 * So one whole fast is day D−1's `fastStartAt` paired with day D's `fastEndAt`,
 * credited to D. Pairing is the only thing this module does that isn't
 * arithmetic, and `fastForDay` is the one place it happens.
 *
 * Two consequences worth stating, because they look like bugs otherwise:
 *
 *   1. **A plan's first day can never be credited a fast.** The start it would
 *      need sits on the day before the plan began, which has no row. Day one is
 *      therefore left out of every denominator rather than counted as a day you
 *      failed — the same reasoning that gives `Task` a `startDate`.
 *   2. **A fast is only judged once it is closed.** Being nineteen hours into an
 *      eighteen-hour goal is not a success yet: you might have eaten at eleven
 *      and forgotten to say so, which is exactly why the end time is editable.
 *      Until an end is logged the day is unmet, and `status` says "running"
 *      rather than pretending to a verdict.
 *
 * Missing fasts follow the app's rule that absent is not zero — but with a
 * split the other measurements don't need. A day with no fast draws no bar on
 * the chart, because no measurement was taken. It still counts against the
 * success rate, because a day you did not fast is a day you did not fast.
 */

import { fastingPlanHours, planTargets, type EntryInput, type PlanInput } from "./calc";
import {
  addDays,
  compareDates,
  dateRange,
  daysBetween,
  formatShort,
  formatWeekday,
  startOfWeek,
  type PlainDate,
} from "./date";

const MS_PER_HOUR = 3_600_000;

export type EntriesByDate = ReadonlyMap<PlainDate, EntryInput>;

/**
 * Where a day's fast stands.
 *
 * - `none` — nothing was started the day before, so there is nothing to judge.
 * - `running` — a start is logged and no end is, so the fast is still open.
 * - `complete` — both ends are known and the duration is final.
 */
export type FastStatus = "none" | "running" | "complete";

export interface FastDay {
  /** The day credited with this fast, which is the day it ends. */
  date: PlainDate;
  /** Logged on the previous day. */
  startAt: Date | null;
  /** Logged on `date` itself. */
  endAt: Date | null;
  status: FastStatus;
  /** Hours fasted. Null until the fast is closed — a running fast has no total. */
  hours: number | null;
  /** True only for a closed fast that reached the goal. */
  met: boolean;
  /** The goal this day was judged against. */
  goalHours: number;
}

/** Hours between two instants. Works across daylight saving, being instant-based. */
export function hoursBetween(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / MS_PER_HOUR;
}

/**
 * The first day a fast can be credited to — the plan's second day.
 *
 * See consequence (1) above: a fast credited to day one would have had to begin
 * before the plan existed.
 */
export function firstCreditableDate(plan: PlanInput): PlainDate {
  return addDays(plan.startDate, 1);
}

/** Whether a fast can be credited to this day at all. */
export function isCreditable(plan: PlanInput, date: PlainDate): boolean {
  const { endDate } = planTargets(plan);
  return (
    compareDates(date, firstCreditableDate(plan)) >= 0 &&
    compareDates(date, endDate) <= 0
  );
}

/**
 * The fast credited to one day: yesterday's start paired with today's end.
 *
 * Returns null when fasting is switched off for the plan, so callers that
 * forget to check cannot render an empty fasting section.
 */
export function fastForDay(
  plan: PlanInput,
  date: PlainDate,
  entries: EntriesByDate,
): FastDay | null {
  if (plan.fastingPlan === null) return null;

  const goalHours = fastingPlanHours(plan.fastingPlan);
  const startAt = entries.get(addDays(date, -1))?.fastStartAt ?? null;
  const endAt = entries.get(date)?.fastEndAt ?? null;

  // An end with no start is not a fast. The Log screen refuses to record one,
  // but a plan edited to start later can strand a row this way, and a half
  // interval must never be measured from nothing.
  if (startAt === null) {
    return { date, startAt: null, endAt, status: "none", hours: null, met: false, goalHours };
  }

  if (endAt === null) {
    return { date, startAt, endAt: null, status: "running", hours: null, met: false, goalHours };
  }

  const hours = hoursBetween(startAt, endAt);
  return {
    date,
    startAt,
    endAt,
    status: "complete",
    hours,
    // "Hit or exceeded", so the comparison is inclusive.
    met: hours >= goalHours,
    goalHours,
  };
}

/**
 * How far through a running fast you are, as a fraction of the goal.
 *
 * Uncapped on purpose: the Today timer uses it to show that you are past the
 * goal and still going, which a value clamped to 1 could not express.
 */
export function fastProgress(startAt: Date, goalHours: number, now: Date): number {
  if (goalHours <= 0) return 1;
  return hoursBetween(startAt, now) / goalHours;
}

/** The instant a fast started at `startAt` reaches the plan's goal. */
export function goalReachedAt(startAt: Date, goalHours: number): Date {
  return new Date(startAt.getTime() + goalHours * MS_PER_HOUR);
}

// ---------------------------------------------------------------------------
// The week view
// ---------------------------------------------------------------------------

export interface FastingWeek {
  /** Sunday. */
  start: PlainDate;
  /** Saturday. */
  end: PlainDate;
  /**
   * Always seven days, Sunday through Saturday, including any that fall outside
   * the plan — a week that silently rendered five bars would misread as five
   * days of data rather than a week clipped by the plan's edges.
   */
  days: FastingWeekDay[];
}

export interface FastingWeekDay {
  date: PlainDate;
  /** Null for a day outside the plan, or one no fast can be credited to. */
  fast: FastDay | null;
}

/**
 * One Sunday-to-Saturday week of fasts.
 *
 * Days outside the plan carry a null fast rather than being dropped, so the
 * chart always draws seven slots and the week's shape stays readable.
 */
export function fastingWeek(
  plan: PlanInput,
  entries: EntriesByDate,
  weekStart: PlainDate,
): FastingWeek {
  const start = startOfWeek(weekStart);

  return {
    start,
    end: addDays(start, 6),
    days: dateRange(start, 7).map((date) => ({
      date,
      fast: isCreditable(plan, date) ? fastForDay(plan, date, entries) : null,
    })),
  };
}

/**
 * The range of weeks worth showing: the one holding the plan's start through
 * the one holding today, never past it. There is nothing to see in the future.
 */
export function fastingWeekBounds(
  plan: PlanInput,
  today: PlainDate,
): { earliest: PlainDate; latest: PlainDate } {
  const { endDate } = planTargets(plan);
  const lastDay = compareDates(today, endDate) < 0 ? today : endDate;

  const earliest = startOfWeek(plan.startDate);
  const latest = startOfWeek(
    compareDates(lastDay, plan.startDate) > 0 ? lastDay : plan.startDate,
  );

  return { earliest, latest };
}

/** Steps a week, refusing to leave the bounds. Null when there is nowhere to go. */
export function stepWeek(
  weekStart: PlainDate,
  direction: -1 | 1,
  bounds: { earliest: PlainDate; latest: PlainDate },
): PlainDate | null {
  const next = addDays(startOfWeek(weekStart), direction * 7);
  if (compareDates(next, bounds.earliest) < 0) return null;
  if (compareDates(next, bounds.latest) > 0) return null;
  return next;
}

// ---------------------------------------------------------------------------
// Plan-wide statistics
// ---------------------------------------------------------------------------

export interface FastingStats {
  goalHours: number;

  /** Days of the plan a fast could ever be credited to — every day but the first. */
  creditableDays: number;
  /** Those that have happened so far. The denominator for the success rate. */
  elapsedDays: number;

  /** Closed fasts among the elapsed days, whether or not they reached the goal. */
  completedFasts: number;
  /** Closed fasts that reached the goal. */
  daysMet: number;
  /** `daysMet / elapsedDays`. Zero rather than NaN before the second day. */
  metRate: number;

  /**
   * Hours actually fasted. A fifteen-hour fast against an eighteen-hour goal is
   * a missed day that still banked fifteen hours; a day never logged banks none.
   */
  totalHours: number;
  /** `goalHours` for every creditable day of the whole plan, elapsed or not. */
  requiredHours: number;
  /** `totalHours / requiredHours`, capped at 1 so a progress bar can't overrun. */
  hoursProgress: number;

  /** The longest single fast, and the mean across closed ones. Null with none. */
  longestFastHours: number | null;
  averageFastHours: number | null;
}

/**
 * Everything the Progress screen reports, in one pass over the plan's days.
 *
 * Two different denominators, which is deliberate rather than an oversight:
 * the success *rate* counts only days that have happened, because a day still
 * in the future is not yet a failure, while the hours progress bar measures
 * against the whole plan, because that is the total the plan is asking for.
 */
export function fastingStats(
  plan: PlanInput,
  entries: EntriesByDate,
  today: PlainDate,
): FastingStats | null {
  if (plan.fastingPlan === null) return null;

  const goalHours = fastingPlanHours(plan.fastingPlan);
  const { endDate } = planTargets(plan);

  // Every day but the first; never fewer than zero for a one-day plan.
  const creditableDays = Math.max(plan.days - 1, 0);

  const lastElapsed = compareDates(today, endDate) < 0 ? today : endDate;
  const elapsedDays = Math.max(
    Math.min(daysBetween(firstCreditableDate(plan), lastElapsed) + 1, creditableDays),
    0,
  );

  let completedFasts = 0;
  let daysMet = 0;
  let totalHours = 0;
  let longestFastHours: number | null = null;

  for (let index = 0; index < elapsedDays; index += 1) {
    const fast = fastForDay(plan, addDays(firstCreditableDate(plan), index), entries);
    if (fast === null || fast.status !== "complete" || fast.hours === null) continue;

    completedFasts += 1;
    // A fast logged backwards would otherwise subtract from the total.
    totalHours += Math.max(fast.hours, 0);
    if (fast.met) daysMet += 1;
    if (longestFastHours === null || fast.hours > longestFastHours) {
      longestFastHours = fast.hours;
    }
  }

  const requiredHours = goalHours * creditableDays;

  return {
    goalHours,
    creditableDays,
    elapsedDays,
    completedFasts,
    daysMet,
    metRate: elapsedDays === 0 ? 0 : daysMet / elapsedDays,
    totalHours,
    requiredHours,
    hoursProgress:
      requiredHours === 0 ? 0 : Math.min(totalHours / requiredHours, 1),
    longestFastHours,
    averageFastHours: completedFasts === 0 ? null : totalHours / completedFasts,
  };
}

// ---------------------------------------------------------------------------
// The week chart
// ---------------------------------------------------------------------------

/**
 * Why a day looks the way it does on the chart.
 *
 * `met` and `missed` draw a bar; the rest draw nothing, and the tooltip says
 * which kind of nothing it is. A day you did not fast is genuinely different
 * from a day outside the plan, and from one whose fast is still running.
 */
export type FastingBarState = "met" | "missed" | "running" | "none" | "outside";

export interface FastingBar {
  date: PlainDate;
  /** "Sun" — the axis tick. */
  weekday: string;
  /** "Sep 13" — the tooltip's heading. */
  label: string;
  /**
   * Hours fasted, or null to draw no bar at all. Null is the app's usual rule:
   * a day with no fast is a day nothing was measured, not a day of zero hours.
   * It still counts as missed in the statistics — see `fastingStats`.
   */
  hours: number | null;
  state: FastingBarState;
}

/** One Sunday-to-Saturday week, ready to plot. */
export function fastingBars(
  plan: PlanInput,
  entries: EntriesByDate,
  weekStart: PlainDate,
): FastingBar[] {
  return fastingWeek(plan, entries, weekStart).days.map(({ date, fast }) => {
    const base = { date, weekday: formatWeekday(date), label: formatShort(date) };

    if (fast === null) return { ...base, hours: null, state: "outside" as const };
    if (fast.status === "running") return { ...base, hours: null, state: "running" as const };
    if (fast.status === "none" || fast.hours === null) {
      return { ...base, hours: null, state: "none" as const };
    }

    return {
      ...base,
      // A fast logged backwards would otherwise draw below the axis.
      hours: Math.max(fast.hours, 0),
      state: fast.met ? ("met" as const) : ("missed" as const),
    };
  });
}

/** "Sep 13 – Sep 19", for the heading above the chart. */
export function fastingWeekLabel(week: FastingWeek): string {
  return `${formatShort(week.start)} – ${formatShort(week.end)}`;
}
