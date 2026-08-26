/**
 * Streak arithmetic is the kind that looks obvious and is quietly wrong at the
 * edges: the day in progress, the task added mid-plan, the plan that has
 * already finished. These pin all of those down.
 */

import { describe, expect, it } from "vitest";
import {
  computeTaskStats,
  isAutoRuleSatisfied,
  taskCalendar,
  taskDays,
  taskWindow,
  type TaskInput,
} from "./streaks";
import type { EntryInput, PlanInput } from "./calc";
import type { PlainDate } from "./date";

const plan: PlanInput = {
  startDate: "2026-08-05",
  days: 93,
  rmr: 1980,
  calsPerLb: 3500,
  lbsToLose: 33,
  targetActiveCals: 1200,
  startWeight: 232.6,
  startBodyFat: 0.299,
  startVo2Max: 37.2,
  startSystolic: 134,
  startDiastolic: 91,
};

const manualTask: TaskInput = {
  id: "t1",
  name: "No eating out",
  position: 0,
  autoRule: "manual",
  startDate: "2026-08-05",
};

const noEntries = new Map<PlainDate, EntryInput>();
const ticks = (...dates: PlainDate[]) => new Set(dates);

describe("taskWindow", () => {
  it("runs from the plan's start to today", () => {
    const w = taskWindow(manualTask, plan, "2026-08-09");
    expect(w.start).toBe("2026-08-05");
    expect(w.end).toBe("2026-08-09");
    expect(w.length).toBe(5);
  });

  it("counts a tick on the plan's first day, even for a task set up later", () => {
    // The regression: tasks were created with startDate = today, so setting
    // them up on day 2 and ticking day 1 counted for nothing.
    const task = { ...manualTask, startDate: plan.startDate };
    const stats = computeTaskStats(task, plan, ticks("2026-08-05"), noEntries, "2026-08-06");

    expect(stats.eligibleDays).toBe(2);
    expect(stats.completedDays).toBe(1);
    expect(stats.currentStreak).toBe(1);
    expect(stats.pendingToday).toBe(true);
  });

  it("starts at the task's own start date when it was added later", () => {
    const late = { ...manualTask, startDate: "2026-08-20" };
    const w = taskWindow(late, plan, "2026-08-25");

    expect(w.start).toBe("2026-08-20");
    expect(w.length).toBe(6);
  });

  it("stops at the plan's last day once the plan is over", () => {
    const w = taskWindow(manualTask, plan, "2027-01-01");
    expect(w.end).toBe("2026-11-05");
  });

  it("is empty before the task has started", () => {
    const future = { ...manualTask, startDate: "2026-09-01" };
    expect(taskWindow(future, plan, "2026-08-10").length).toBe(0);
  });
});

describe("computeTaskStats — the day in progress", () => {
  it("keeps the streak alive when today isn't ticked yet", () => {
    // Ticked through yesterday; today untouched at nine in the morning.
    const stats = computeTaskStats(
      manualTask,
      plan,
      ticks("2026-08-05", "2026-08-06", "2026-08-07"),
      noEntries,
      "2026-08-08",
    );

    expect(stats.currentStreak).toBe(3);
    expect(stats.doneToday).toBe(false);
    expect(stats.pendingToday).toBe(true);
  });

  it("counts today once it is ticked", () => {
    const stats = computeTaskStats(
      manualTask,
      plan,
      ticks("2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08"),
      noEntries,
      "2026-08-08",
    );

    expect(stats.currentStreak).toBe(4);
    expect(stats.doneToday).toBe(true);
    expect(stats.pendingToday).toBe(false);
  });

  it("breaks when yesterday was missed, even if today is still open", () => {
    const stats = computeTaskStats(
      manualTask,
      plan,
      ticks("2026-08-05", "2026-08-06"),
      noEntries,
      "2026-08-08",
    );

    expect(stats.currentStreak).toBe(0);
    expect(stats.pendingToday).toBe(false);
  });

  it("survives a missed day only in the best streak, not the current one", () => {
    const stats = computeTaskStats(
      manualTask,
      plan,
      // 5,6,7 then a gap on the 8th, then 9,10
      ticks("2026-08-05", "2026-08-06", "2026-08-07", "2026-08-09", "2026-08-10"),
      noEntries,
      "2026-08-10",
    );

    expect(stats.currentStreak).toBe(2);
    expect(stats.bestStreak).toBe(3);
  });
});

describe("computeTaskStats — totals", () => {
  it("counts done out of days it could have been done", () => {
    // Day 12 of the plan, ticked 9 times — the example from the brief.
    const dates = Array.from({ length: 12 }, (_, i) => addDaysLocal("2026-08-05", i));
    const stats = computeTaskStats(
      manualTask,
      plan,
      ticks(...dates.filter((_, i) => i !== 3 && i !== 7 && i !== 9)),
      noEntries,
      "2026-08-16",
    );

    expect(stats.eligibleDays).toBe(12);
    expect(stats.completedDays).toBe(9);
    expect(stats.completionRate).toBeCloseTo(9 / 12, 10);
  });

  it("measures a task added mid-plan from its own start, not the plan's", () => {
    // Added on day 20 and done once: that's 1 of 1, not 1 of 20.
    const late = { ...manualTask, startDate: "2026-08-24" };
    const stats = computeTaskStats(late, plan, ticks("2026-08-24"), noEntries, "2026-08-24");

    expect(stats.eligibleDays).toBe(1);
    expect(stats.completedDays).toBe(1);
    expect(stats.completionRate).toBe(1);
  });

  it("reports zeroes for a task that hasn't started", () => {
    const future = { ...manualTask, startDate: "2026-09-01" };
    const stats = computeTaskStats(future, plan, new Set(), noEntries, "2026-08-10");

    expect(stats.eligibleDays).toBe(0);
    expect(stats.completionRate).toBe(0);
    expect(stats.doneToday).toBeNull();
  });

  it("never divides by zero", () => {
    const future = { ...manualTask, startDate: "2026-09-01" };
    expect(
      Number.isFinite(computeTaskStats(future, plan, new Set(), noEntries, "2026-08-10").completionRate),
    ).toBe(true);
  });

  it("ignores ticks outside the window", () => {
    const stats = computeTaskStats(
      manualTask,
      plan,
      ticks("2026-07-01", "2026-08-05", "2027-01-01"),
      noEntries,
      "2026-08-05",
    );

    expect(stats.completedDays).toBe(1);
    expect(stats.eligibleDays).toBe(1);
  });
});

describe("auto-linked tasks", () => {
  const entry = (date: PlainDate, fields: Partial<EntryInput>): EntryInput => ({
    date,
    weight: null,
    bodyFat: null,
    vo2Max: null,
    systolic: null,
    diastolic: null,
    consumedCals: null,
    activeCals: null,
    ...fields,
  });

  it("counts a day where active calories reached the floor", () => {
    expect(
      isAutoRuleSatisfied("activeCalsAtLeastTarget", entry("d", { activeCals: 1200 }), plan),
    ).toBe(true);
    expect(
      isAutoRuleSatisfied("activeCalsAtLeastTarget", entry("d", { activeCals: 1199 }), plan),
    ).toBe(false);
  });

  it("counts a day where eaten calories stayed under the ceiling", () => {
    // The ceiling for this plan is 1,938.06.
    expect(
      isAutoRuleSatisfied("consumedCalsAtMostCeiling", entry("d", { consumedCals: 1900 }), plan),
    ).toBe(true);
    expect(
      isAutoRuleSatisfied("consumedCalsAtMostCeiling", entry("d", { consumedCals: 2100 }), plan),
    ).toBe(false);
  });

  it("treats an unlogged day as not done, rather than as met", () => {
    expect(isAutoRuleSatisfied("activeCalsAtLeastTarget", undefined, plan)).toBe(false);
    expect(
      isAutoRuleSatisfied("activeCalsAtLeastTarget", entry("d", { activeCals: null }), plan),
    ).toBe(false);
  });

  it("builds a streak from logged calories without any ticks", () => {
    const auto: TaskInput = { ...manualTask, id: "t2", autoRule: "activeCalsAtLeastTarget" };
    const entries = new Map<PlainDate, EntryInput>([
      ["2026-08-05", entry("2026-08-05", { activeCals: 1310 })],
      ["2026-08-06", entry("2026-08-06", { activeCals: 1250 })],
      ["2026-08-07", entry("2026-08-07", { activeCals: 900 })],
    ]);

    const stats = computeTaskStats(auto, plan, new Set(), entries, "2026-08-07");

    expect(stats.completedDays).toBe(2);
    expect(stats.bestStreak).toBe(2);

    // The 7th is short at 900, but it is *today* — there is still time to train
    // and log more. A logged-but-insufficient number is pending for the same
    // reason an unticked box is, so the streak stands at 2 rather than breaking.
    expect(stats.currentStreak).toBe(2);
    expect(stats.pendingToday).toBe(true);
  });

  it("breaks an auto streak once the short day is in the past", () => {
    const auto: TaskInput = { ...manualTask, id: "t2", autoRule: "activeCalsAtLeastTarget" };
    const entries = new Map<PlainDate, EntryInput>([
      ["2026-08-05", entry("2026-08-05", { activeCals: 1310 })],
      ["2026-08-06", entry("2026-08-06", { activeCals: 1250 })],
      ["2026-08-07", entry("2026-08-07", { activeCals: 900 })],
    ]);

    // A day later the 7th can no longer be rescued.
    const stats = computeTaskStats(auto, plan, new Set(), entries, "2026-08-08");

    expect(stats.currentStreak).toBe(0);
    expect(stats.bestStreak).toBe(2);
  });

  it("ignores manual ticks entirely", () => {
    const auto: TaskInput = { ...manualTask, id: "t2", autoRule: "activeCalsAtLeastTarget" };
    const stats = computeTaskStats(auto, plan, ticks("2026-08-05"), noEntries, "2026-08-05");

    expect(stats.completedDays).toBe(0);
  });
});

describe("taskDays", () => {
  it("returns one entry per day of the window, in order", () => {
    const days = taskDays(manualTask, plan, ticks("2026-08-06"), noEntries, "2026-08-07");

    expect(days.map((d) => d.date)).toEqual(["2026-08-05", "2026-08-06", "2026-08-07"]);
    expect(days.map((d) => d.done)).toEqual([false, true, false]);
    expect(days[2].isToday).toBe(true);
  });
});

describe("taskCalendar", () => {
  const months = taskCalendar(manualTask, plan, ticks("2026-08-06"), noEntries, "2026-08-25");

  it("covers exactly the months the plan spans", () => {
    // 5 Aug to 5 Nov 2026.
    expect(months.map((m) => m.label)).toEqual([
      "August 2026",
      "September 2026",
      "October 2026",
      "November 2026",
    ]);
  });

  it("cannot be scrolled back before the plan started", () => {
    expect(months[0].label).toBe("August 2026");
    const august = months[0].cells.filter((c) => !c.blank);
    // The 1st to the 4th exist in the grid but sit outside the plan.
    expect(august.find((c) => c.date === "2026-08-01")?.inWindow).toBe(false);
    expect(august.find((c) => c.date === "2026-08-05")?.inWindow).toBe(true);
  });

  it("pads the first row so dates land under the right weekday", () => {
    // 1 August 2026 is a Saturday, so six blanks precede it.
    const leadingBlanks = months[0].cells.findIndex((c) => !c.blank);
    expect(leadingBlanks).toBe(6);
  });

  it("marks done days, today, and the future", () => {
    const august = months[0].cells;
    expect(august.find((c) => c.date === "2026-08-06")?.done).toBe(true);
    expect(august.find((c) => c.date === "2026-08-07")?.done).toBe(false);
    expect(august.find((c) => c.date === "2026-08-25")?.isToday).toBe(true);
    expect(august.find((c) => c.date === "2026-08-26")?.isFuture).toBe(true);
  });

  it("never paints a day that hasn't happened as done", () => {
    // The Log screen can be navigated forward inside a plan, so a stray future
    // completion is possible; the calendar must not count it.
    const withFutureTick = taskCalendar(
      manualTask,
      plan,
      ticks("2026-08-06", "2026-09-10"),
      noEntries,
      "2026-08-25",
    );

    const september = withFutureTick[1].cells.find((c) => c.date === "2026-09-10");
    expect(september?.isFuture).toBe(true);
    expect(september?.done).toBe(false);
  });

  it("gives every month a full complement of days", () => {
    const september = months[1].cells.filter((c) => !c.blank);
    expect(september).toHaveLength(30);
    const october = months[2].cells.filter((c) => !c.blank);
    expect(october).toHaveLength(31);
  });
});

/** Local helper so the tests don't depend on date.ts's export surface. */
function addDaysLocal(date: PlainDate, days: number): PlainDate {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}
