/**
 * The fasting rules, stated as tests.
 *
 * The one that matters most is the pairing: a fast spans two days, and the day
 * it *ends* is the day credited with it. Nearly every other rule here is a
 * consequence of that, so if the first describe block passes the rest follow.
 */

import { describe, expect, it } from "vitest";
import {
  fastForDay,
  fastProgress,
  fastingStats,
  fastingWeek,
  fastingWeekBounds,
  firstCreditableDate,
  goalReachedAt,
  hoursBetween,
  isCreditable,
  stepWeek,
} from "./fasting";
import type { EntryInput, PlanInput } from "./calc";
import type { PlainDate } from "./date";

/** An 18:6 plan: eighteen hours fasting, a six-hour window to eat. */
const plan: PlanInput = {
  startDate: "2026-09-01",
  days: 30,
  rmr: 1980,
  calsPerLb: 3500,
  lbsToLose: 10,
  targetActiveCals: 1000,
  startWeight: 224.9,
  startBodyFat: null,
  startVo2Max: null,
  startSystolic: null,
  startDiastolic: null,
  fastingPlan: "fast18_6",
  // Day one sits out unless this is recorded; the block at the end of this
  // file covers what changes when it is.
  preStartFastAt: null,
};

const noFasting: PlanInput = { ...plan, fastingPlan: null };

function entry(date: PlainDate, fields: Partial<EntryInput> = {}): EntryInput {
  return {
    date,
    weight: null,
    bodyFat: null,
    vo2Max: null,
    systolic: null,
    diastolic: null,
    consumedCals: null,
    activeCals: null,
    fastStartAt: null,
    fastEndAt: null,
    ...fields,
  };
}

function entries(...rows: EntryInput[]): Map<PlainDate, EntryInput> {
  return new Map(rows.map((row) => [row.date, row]));
}

/** Mountain Time is UTC−6 in September, so 18:30 local is 00:30Z the next day. */
const at = (iso: string) => new Date(iso);

describe("pairing a fast across two days", () => {
  it("credits the day the fast ended, not the day it began", () => {
    // Stopped eating 6:30pm on the 2nd, ate again 12:30pm on the 3rd: 18 hours.
    const logged = entries(
      entry("2026-09-02", { fastStartAt: at("2026-09-03T00:30:00Z") }),
      entry("2026-09-03", { fastEndAt: at("2026-09-03T18:30:00Z") }),
    );

    const credited = fastForDay(plan, "2026-09-03", logged);
    expect(credited?.status).toBe("complete");
    expect(credited?.hours).toBe(18);
    expect(credited?.met).toBe(true);

    // The evening the fast began earns nothing on its own.
    const startDay = fastForDay(plan, "2026-09-02", logged);
    expect(startDay?.status).toBe("none");
    expect(startDay?.met).toBe(false);
  });

  it("reads a start with no end yet as running, with no verdict", () => {
    const logged = entries(
      entry("2026-09-02", { fastStartAt: at("2026-09-03T00:30:00Z") }),
    );

    const credited = fastForDay(plan, "2026-09-03", logged);
    expect(credited?.status).toBe("running");
    expect(credited?.hours).toBeNull();
    // Being past the goal is not the same as having finished — you may have
    // eaten hours ago and not said so. Judgement waits for the end time.
    expect(credited?.met).toBe(false);
  });

  it("ignores an end with no start to pair it with", () => {
    const logged = entries(entry("2026-09-03", { fastEndAt: at("2026-09-03T18:30:00Z") }));

    const credited = fastForDay(plan, "2026-09-03", logged);
    expect(credited?.status).toBe("none");
    expect(credited?.hours).toBeNull();
  });

  it("returns nothing at all when the plan has fasting switched off", () => {
    expect(fastForDay(noFasting, "2026-09-03", entries())).toBeNull();
    expect(fastingStats(noFasting, entries(), "2026-09-10")).toBeNull();
  });
});

describe("meeting the goal", () => {
  const judged = (hours: number) => {
    const start = at("2026-09-03T00:30:00Z");
    const end = new Date(start.getTime() + hours * 3_600_000);
    return fastForDay(
      plan,
      "2026-09-03",
      entries(
        entry("2026-09-02", { fastStartAt: start }),
        entry("2026-09-03", { fastEndAt: end }),
      ),
    );
  };

  it("counts a fast exactly on the goal as met", () => {
    expect(judged(18)?.met).toBe(true);
  });

  it("counts a longer fast as met", () => {
    expect(judged(19.5)?.met).toBe(true);
  });

  it("counts two minutes short as missed", () => {
    const short = judged(17 + 58 / 60);
    expect(short?.met).toBe(false);
    // Still a real measurement — it just didn't reach the goal.
    expect(short?.hours).toBeCloseTo(17.9667, 3);
  });
});

describe("daylight saving", () => {
  /**
   * Denver springs forward on 8 March 2026. A fast from 6:30pm to 12:30pm the
   * next day reads as eighteen hours on the wall clock but really lasted
   * seventeen. Storing instants rather than wall times is what gets this right.
   */
  it("measures the hours that actually elapsed, not the clock difference", () => {
    const marchPlan: PlanInput = { ...plan, startDate: "2026-03-01" };
    const logged = entries(
      // 2026-03-07 18:30 MST
      entry("2026-03-07", { fastStartAt: at("2026-03-08T01:30:00Z") }),
      // 2026-03-08 12:30 MDT
      entry("2026-03-08", { fastEndAt: at("2026-03-08T18:30:00Z") }),
    );

    const credited = fastForDay(marchPlan, "2026-03-08", logged);
    expect(credited?.hours).toBe(17);
    expect(credited?.met).toBe(false);
  });

  it("measures the extra hour an autumn fall-back adds", () => {
    const novemberPlan: PlanInput = { ...plan, startDate: "2026-10-25" };
    const logged = entries(
      // 2026-10-31 18:30 MDT
      entry("2026-10-31", { fastStartAt: at("2026-11-01T00:30:00Z") }),
      // 2026-11-01 12:30 MST
      entry("2026-11-01", { fastEndAt: at("2026-11-01T19:30:00Z") }),
    );

    expect(fastForDay(novemberPlan, "2026-11-01", logged)?.hours).toBe(19);
  });
});

describe("the plan's first day", () => {
  it("cannot be credited a fast, because the start would predate the plan", () => {
    expect(firstCreditableDate(plan)).toBe("2026-09-02");
    expect(isCreditable(plan, "2026-09-01")).toBe(false);
    expect(isCreditable(plan, "2026-09-02")).toBe(true);
  });

  it("is left out of the denominators rather than counted as a failure", () => {
    const stats = fastingStats(plan, entries(), "2026-09-01");
    // Day one has elapsed, but nothing could have been credited to it yet.
    expect(stats?.elapsedDays).toBe(0);
    expect(stats?.metRate).toBe(0);
    expect(stats?.creditableDays).toBe(29);
    expect(stats?.requiredHours).toBe(29 * 18);
  });

  it("stops being creditable past the plan's last day", () => {
    expect(isCreditable(plan, "2026-09-30")).toBe(true);
    expect(isCreditable(plan, "2026-10-01")).toBe(false);
  });
});

describe("plan-wide statistics", () => {
  /** Three days logged: one met, one short, one never logged at all. */
  const logged = entries(
    entry("2026-09-01", { fastStartAt: at("2026-09-02T00:30:00Z") }),
    // 18h — met.
    entry("2026-09-02", {
      fastEndAt: at("2026-09-02T18:30:00Z"),
      fastStartAt: at("2026-09-03T00:30:00Z"),
    }),
    // 15h — missed, but banks its hours.
    entry("2026-09-03", { fastEndAt: at("2026-09-03T15:30:00Z") }),
    // 2026-09-04 never logged: banks nothing, and still counts as missed.
  );

  const stats = fastingStats(plan, logged, "2026-09-04");

  it("counts only days that have happened toward the success rate", () => {
    // The 2nd, 3rd and 4th are creditable and elapsed; the 1st never was.
    expect(stats?.elapsedDays).toBe(3);
    expect(stats?.daysMet).toBe(1);
    expect(stats?.metRate).toBeCloseTo(1 / 3, 6);
  });

  it("banks the hours of a fast that missed the goal", () => {
    expect(stats?.completedFasts).toBe(2);
    expect(stats?.totalHours).toBe(33);
  });

  it("banks nothing for a day that was never logged", () => {
    // Two fasts, 18 and 15. The unlogged 4th contributes zero, not a gap.
    expect(stats?.totalHours).toBe(18 + 15);
  });

  it("measures the hours bar against the whole plan, not the elapsed part", () => {
    expect(stats?.requiredHours).toBe(29 * 18);
    expect(stats?.hoursProgress).toBeCloseTo(33 / (29 * 18), 6);
  });

  it("reports the longest and mean fast", () => {
    expect(stats?.longestFastHours).toBe(18);
    expect(stats?.averageFastHours).toBe(16.5);
  });

  it("has no averages before anything is logged", () => {
    const empty = fastingStats(plan, entries(), "2026-09-10");
    expect(empty?.longestFastHours).toBeNull();
    expect(empty?.averageFastHours).toBeNull();
    expect(empty?.totalHours).toBe(0);
  });
});

describe("the week view", () => {
  it("always returns seven days, Sunday through Saturday", () => {
    // 2026-09-16 is a Wednesday; its week runs the 13th to the 19th.
    const week = fastingWeek(plan, entries(), "2026-09-16");
    expect(week.start).toBe("2026-09-13");
    expect(week.end).toBe("2026-09-19");
    expect(week.days).toHaveLength(7);
  });

  it("marks days outside the plan as having no fast rather than dropping them", () => {
    // The plan starts Tuesday 1 September, so that week's first two days and
    // its first day itself are all outside what can be credited.
    const week = fastingWeek(plan, entries(), "2026-09-01");
    expect(week.start).toBe("2026-08-30");
    expect(week.days).toHaveLength(7);
    expect(week.days[0].fast).toBeNull();
    expect(week.days[2].fast).toBeNull();
    expect(week.days[3].fast).not.toBeNull();
  });

  it("stops at the week holding today and never goes past the plan", () => {
    const bounds = fastingWeekBounds(plan, "2026-09-16");
    expect(bounds.earliest).toBe("2026-08-30");
    expect(bounds.latest).toBe("2026-09-13");

    expect(stepWeek("2026-09-13", 1, bounds)).toBeNull();
    expect(stepWeek("2026-09-13", -1, bounds)).toBe("2026-09-06");
    expect(stepWeek("2026-08-30", -1, bounds)).toBeNull();
  });

  it("clamps to the plan's own end once the plan is over", () => {
    const bounds = fastingWeekBounds(plan, "2027-01-01");
    // The plan ends 2026-09-30, in the week beginning the 27th.
    expect(bounds.latest).toBe("2026-09-27");
  });
});

describe("timer arithmetic", () => {
  const start = at("2026-09-03T00:30:00Z");

  it("reports progress past the goal rather than capping at complete", () => {
    const nineteenHoursIn = new Date(start.getTime() + 19 * 3_600_000);
    expect(fastProgress(start, 18, nineteenHoursIn)).toBeCloseTo(19 / 18, 6);
  });

  it("knows when the goal will be reached", () => {
    expect(goalReachedAt(start, 18).toISOString()).toBe("2026-09-03T18:30:00.000Z");
  });

  it("measures hours between two instants", () => {
    expect(hoursBetween(start, at("2026-09-03T06:30:00Z"))).toBe(6);
  });
});

describe("the evening before the plan", () => {
  /** The same plan, with the last meal before day one recorded at 6:30pm. */
  const withPreStart: PlanInput = {
    ...plan,
    preStartFastAt: at("2026-09-01T00:30:00Z"),
  };

  it("makes day one creditable, which it otherwise never is", () => {
    expect(isCreditable(plan, "2026-09-01")).toBe(false);
    expect(isCreditable(withPreStart, "2026-09-01")).toBe(true);

    expect(firstCreditableDate(plan)).toBe("2026-09-02");
    expect(firstCreditableDate(withPreStart)).toBe("2026-09-01");
  });

  it("pairs with day one's first meal to make a whole fast", () => {
    const logged = entries(
      entry("2026-09-01", { fastEndAt: at("2026-09-01T18:30:00Z") }),
    );

    const credited = fastForDay(withPreStart, "2026-09-01", logged);
    expect(credited?.status).toBe("complete");
    expect(credited?.hours).toBe(18);
    expect(credited?.met).toBe(true);
  });

  it("is ignored on every other day, which still read the previous row", () => {
    // Day two's start is day one's evening, never the pre-plan one.
    const logged = entries(
      entry("2026-09-01", { fastStartAt: at("2026-09-02T00:30:00Z") }),
      entry("2026-09-02", { fastEndAt: at("2026-09-02T18:30:00Z") }),
    );

    expect(fastForDay(withPreStart, "2026-09-02", logged)?.hours).toBe(18);
  });

  it("leaves day one uncredited when it is absent, rather than failed", () => {
    const logged = entries(
      entry("2026-09-01", { fastEndAt: at("2026-09-01T18:30:00Z") }),
    );

    // An end with nothing to pair it to is not a fast, and not a miss either.
    expect(fastForDay(plan, "2026-09-01", logged)?.status).toBe("none");
  });

  it("grows every denominator by exactly one day", () => {
    const without = fastingStats(plan, entries(), "2026-09-10")!;
    const with_ = fastingStats(withPreStart, entries(), "2026-09-10")!;

    expect(without.creditableDays).toBe(29);
    expect(with_.creditableDays).toBe(30);
    expect(with_.requiredHours).toBe(30 * 18);
    expect(with_.firstDayCounts).toBe(true);
    expect(without.firstDayCounts).toBe(false);

    // Nine elapsed creditable days without it, ten with.
    expect(with_.elapsedDays).toBe(without.elapsedDays + 1);
  });

  it("lets a flawless record reach 100% either way", () => {
    // Day one met, day two met, and nothing else has happened yet.
    const logged = entries(
      entry("2026-09-01", {
        fastEndAt: at("2026-09-01T18:30:00Z"),
        fastStartAt: at("2026-09-02T00:30:00Z"),
      }),
      entry("2026-09-02", { fastEndAt: at("2026-09-02T18:30:00Z") }),
    );

    const stats = fastingStats(withPreStart, logged, "2026-09-02")!;
    expect(stats.daysMet).toBe(2);
    expect(stats.elapsedDays).toBe(2);
    expect(stats.metRate).toBe(1);
  });
});
