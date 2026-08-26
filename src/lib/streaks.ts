/**
 * Streaks.
 *
 * A task is done on a day or it isn't, and the interesting numbers fall out of
 * that: how many days in a row ending now, the best run ever, and how often it
 * has been done out of the days it could have been.
 *
 * Two decisions shape everything here.
 *
 * **Today is pending, not missed.** An untouched task at nine in the morning
 * shows yesterday's streak intact. Counting today as a failure before the day
 * is over would zero every streak overnight, which is both wrong and the exact
 * thing that makes people stop looking.
 *
 * **A task's clock starts when the task does.** A habit added on day 20 of a
 * 93-day plan reads 0 of 1, not 0 of 20. Otherwise every new intention arrives
 * pre-failed.
 *
 * Pure functions over plain data — no database, no React.
 */

import type { EntryInput, PlanInput } from "./calc";
import { planTargets } from "./calc";
import { addDays, compareDates, daysBetween, type PlainDate } from "./date";

export type TaskAutoRule =
  | "manual"
  | "activeCalsAtLeastTarget"
  | "consumedCalsAtMostCeiling";

export interface TaskInput {
  id: string;
  name: string;
  position: number;
  autoRule: TaskAutoRule;
  /** First day this task counts. */
  startDate: PlainDate;
}

export interface TaskStats {
  /** Days in a row ending today, or ending yesterday if today isn't done yet. */
  currentStreak: number;
  /** The longest run at any point. */
  bestStreak: number;
  /** Days done, out of the days it could have been done. */
  completedDays: number;
  eligibleDays: number;
  /** 0–1. Zero eligible days reads as 0 rather than dividing by nothing. */
  completionRate: number;
  /** Whether today itself is done. Null when today falls outside the task. */
  doneToday: boolean | null;
  /** True when today is not done but the streak is still alive from yesterday. */
  pendingToday: boolean;
}

export interface TaskDay {
  date: PlainDate;
  /** Within the plan and on or after the task's start date. */
  eligible: boolean;
  done: boolean;
  isToday: boolean;
  isFuture: boolean;
}

/**
 * Whether an auto-linked task counts as done for a given day.
 *
 * Returns false for a day with nothing logged: an unlogged day is not a day
 * the goal was met. Manual tasks never reach here.
 */
export function isAutoRuleSatisfied(
  rule: TaskAutoRule,
  entry: EntryInput | undefined,
  plan: PlanInput,
): boolean {
  if (!entry) return false;
  const targets = planTargets(plan);

  switch (rule) {
    case "activeCalsAtLeastTarget":
      return entry.activeCals !== null && entry.activeCals >= targets.targetActiveCals;
    case "consumedCalsAtMostCeiling":
      return entry.consumedCals !== null && entry.consumedCals <= targets.allowedFoodCals;
    default:
      return false;
  }
}

/** The window a task is measured over: its own start through today, inside the plan. */
export function taskWindow(
  task: TaskInput,
  plan: PlanInput,
  today: PlainDate,
): { start: PlainDate; end: PlainDate; length: number } {
  const planEnd = planTargets(plan).endDate;

  const start = compareDates(task.startDate, plan.startDate) > 0
    ? task.startDate
    : plan.startDate;
  // Never counts days that haven't happened, and never past the plan's end.
  const end = compareDates(today, planEnd) > 0 ? planEnd : today;

  const length = compareDates(end, start) < 0 ? 0 : daysBetween(start, end) + 1;
  return { start, end, length };
}

/**
 * Every day of a task's window, marked done or not.
 *
 * `completions` is the set of dates a manual task was ticked; auto-linked tasks
 * ignore it and read the day's logged calories instead.
 */
export function taskDays(
  task: TaskInput,
  plan: PlanInput,
  completions: ReadonlySet<PlainDate>,
  entriesByDate: ReadonlyMap<PlainDate, EntryInput>,
  today: PlainDate,
): TaskDay[] {
  const { start, length } = taskWindow(task, plan, today);
  if (length === 0) return [];

  return Array.from({ length }, (_, index) => {
    const date = addDays(start, index);
    return {
      date,
      eligible: true,
      done: isDoneOn(task, date, completions, entriesByDate, plan),
      isToday: date === today,
      isFuture: false,
    };
  });
}

function isDoneOn(
  task: TaskInput,
  date: PlainDate,
  completions: ReadonlySet<PlainDate>,
  entriesByDate: ReadonlyMap<PlainDate, EntryInput>,
  plan: PlanInput,
): boolean {
  if (task.autoRule === "manual") return completions.has(date);
  return isAutoRuleSatisfied(task.autoRule, entriesByDate.get(date), plan);
}

/**
 * Current streak, best streak and completion rate.
 *
 * The current streak walks backwards from today. If today isn't done it starts
 * from yesterday instead — today is still in progress, not yet a miss.
 */
export function computeTaskStats(
  task: TaskInput,
  plan: PlanInput,
  completions: ReadonlySet<PlainDate>,
  entriesByDate: ReadonlyMap<PlainDate, EntryInput>,
  today: PlainDate,
): TaskStats {
  const days = taskDays(task, plan, completions, entriesByDate, today);

  if (days.length === 0) {
    return {
      currentStreak: 0,
      bestStreak: 0,
      completedDays: 0,
      eligibleDays: 0,
      completionRate: 0,
      doneToday: null,
      pendingToday: false,
    };
  }

  const completedDays = days.filter((day) => day.done).length;

  let bestStreak = 0;
  let run = 0;
  for (const day of days) {
    run = day.done ? run + 1 : 0;
    if (run > bestStreak) bestStreak = run;
  }

  const last = days[days.length - 1];
  const todayIsInWindow = last.isToday;
  const doneToday = todayIsInWindow ? last.done : null;

  // Skip today when it isn't done yet; the day hasn't failed until it's over.
  let index = days.length - 1;
  if (todayIsInWindow && !last.done) index -= 1;

  let currentStreak = 0;
  for (; index >= 0; index -= 1) {
    if (!days[index].done) break;
    currentStreak += 1;
  }

  return {
    currentStreak,
    bestStreak,
    completedDays,
    eligibleDays: days.length,
    completionRate: days.length === 0 ? 0 : completedDays / days.length,
    doneToday,
    pendingToday: todayIsInWindow && !last.done && currentStreak > 0,
  };
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

export interface CalendarCell {
  date: PlainDate;
  /** Blank padding so the first row lines up under the right weekday. */
  blank: boolean;
  inWindow: boolean;
  done: boolean;
  isToday: boolean;
  isFuture: boolean;
}

export interface CalendarMonth {
  /** First day of the month, for the heading. */
  month: PlainDate;
  label: string;
  cells: CalendarCell[];
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Month grids covering the plan, one per calendar month it touches.
 *
 * Only months the plan actually spans are produced, so the calendar can't be
 * scrolled back into time before the plan began — days outside the plan simply
 * don't exist here.
 */
export function taskCalendar(
  task: TaskInput,
  plan: PlanInput,
  completions: ReadonlySet<PlainDate>,
  entriesByDate: ReadonlyMap<PlainDate, EntryInput>,
  today: PlainDate,
): CalendarMonth[] {
  const planEnd = planTargets(plan).endDate;
  const windowStart = compareDates(task.startDate, plan.startDate) > 0
    ? task.startDate
    : plan.startDate;

  const months: CalendarMonth[] = [];
  let cursor = firstOfMonth(plan.startDate);

  while (compareDates(cursor, planEnd) <= 0) {
    const [year, month] = cursor.split("-").map(Number);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const leading = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();

    const cells: CalendarCell[] = [];
    for (let i = 0; i < leading; i += 1) {
      cells.push({
        date: cursor,
        blank: true,
        inWindow: false,
        done: false,
        isToday: false,
        isFuture: false,
      });
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const inWindow =
        compareDates(date, windowStart) >= 0 && compareDates(date, planEnd) <= 0;
      const isFuture = compareDates(date, today) > 0;

      cells.push({
        date,
        blank: false,
        inWindow,
        // Never mark a future day done, even if a stray completion exists for
        // it. The stats already stop at today; the calendar must agree.
        done: inWindow && !isFuture && isDoneOn(task, date, completions, entriesByDate, plan),
        isToday: date === today,
        isFuture,
      });
    }

    months.push({
      month: cursor,
      label: `${MONTH_NAMES[month - 1]} ${year}`,
      cells,
    });

    cursor = nextMonth(cursor);
  }

  return months;
}

function firstOfMonth(date: PlainDate): PlainDate {
  return `${date.slice(0, 7)}-01`;
}

function nextMonth(date: PlainDate): PlainDate {
  const [year, month] = date.split("-").map(Number);
  return month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, "0")}-01`;
}

/** "3 days", "1 day" — so a bare number never floats unlabelled. */
export function formatStreak(days: number): string {
  return `${days} ${days === 1 ? "day" : "days"}`;
}

export const AUTO_RULE_LABELS: Record<TaskAutoRule, string> = {
  manual: "Tick it yourself",
  activeCalsAtLeastTarget: "Ticks when active calories reach your floor",
  consumedCalsAtMostCeiling: "Ticks when eaten calories stay under your ceiling",
};
