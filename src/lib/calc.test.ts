/**
 * The calc layer is verified against the "Attempt - 3/3" tab of the original
 * Numbers spreadsheet — a real 30-day plan with twelve fully logged days and
 * known-good outputs. If these pass, the app reproduces the spreadsheet exactly.
 *
 * Expected values are taken straight from the sheet's own cells, cited inline.
 */

import { describe, expect, it } from "vitest";
import {
  dayMetrics,
  planProgress,
  planTargets,
  series,
  type EntryInput,
  type PlanInput,
} from "./calc";

/** The 3/3 plan as configured in cells O3:O7. */
const marchPlan: PlanInput = {
  startDate: "2026-03-03",
  days: 30,
  rmr: 1980,
  calsPerLb: 3500,
  lbsToLose: 10,
  targetActiveCals: 1000,
  startWeight: 224.9,
  startBodyFat: 0.274,
  startVo2Max: 35.4,
  startSystolic: 134,
  startDiastolic: 91,
};

/** Rows 3–16 of the sheet. Blank cells are null, exactly as they were blank there. */
const marchEntries: EntryInput[] = [
  row("2026-03-03", 224.9, 0.274, 35.4, 134, 91, 1450, 1157),
  row("2026-03-04", 222.8, 0.27, 35.5, 128, 88, 1648, 918),
  row("2026-03-05", 223.2, 0.268, 35.5, 134, 89, 1700, 1239),
  row("2026-03-06", 222.6, 0.266, 35.5, 128, 86, 1948, 1176),
  row("2026-03-07", 222.6, 0.272, 35.5, 127, 87, 2507, 1621),
  row("2026-03-08", 223.1, 0.273, 35.5, 131, 84, 1889, 1750),
  row("2026-03-09", 224.9, 0.27, 37.1, 125, 77, 1779, 1350),
  row("2026-03-10", 223.4, 0.258, 37.3, 114, 72, 2145, 1350),
  row("2026-03-11", 222.8, 0.259, 37.3, 127, 72, 1947, 1332),
  // 3/12 and 3/13 were skipped entirely — the gap is part of the fixture.
  row("2026-03-14", 223.4, 0.259, 37.3, null, null, 2025, 1541),
  row("2026-03-15", 225.5, 0.268, 37.3, 123, 79, 1323, 1354),
  row("2026-03-16", 223.9, 0.269, 37.3, 123, 79, 1564, 1500),
];

function row(
  date: string,
  weight: number | null,
  bodyFat: number | null,
  vo2Max: number | null,
  systolic: number | null,
  diastolic: number | null,
  consumedCals: number | null,
  activeCals: number | null,
): EntryInput {
  return {
    date,
    weight,
    bodyFat,
    vo2Max,
    systolic,
    diastolic,
    consumedCals,
    activeCals,
  };
}

describe("planTargets", () => {
  const targets = planTargets(marchPlan);

  it("derives the necessary daily deficit (cell O11)", () => {
    expect(targets.necessaryDailyDeficit).toBeCloseTo(1166.66666666667, 6);
  });

  it("derives the allowed food calories (cell O10)", () => {
    expect(targets.allowedFoodCals).toBeCloseTo(1813.33333333333, 6);
  });

  it("derives the total deficit target", () => {
    expect(targets.totalDeficitTarget).toBe(35000);
  });

  it("derives the goal weight and the inclusive end date", () => {
    expect(targets.targetWeight).toBeCloseTo(214.9, 10);
    expect(targets.endDate).toBe("2026-04-01");
  });

  it("matches the long-form spreadsheet expression for allowed food calories", () => {
    // O10 was written as (((O4×O6)−(O3×O5)−(O7×O5))÷O5)×−1. The simplified form
    // in planTargets must agree with it for any inputs, not just these.
    const { calsPerLb: c, lbsToLose: l, rmr, days, targetActiveCals: a } = marchPlan;
    const asWrittenInTheSheet = (((c * l - rmr * days - a * days) / days) * -1);
    expect(targets.allowedFoodCals).toBeCloseTo(asWrittenInTheSheet, 9);
  });
});

describe("dayMetrics", () => {
  const targets = planTargets(marchPlan);

  it("computes the daily deficit as (RMR + active) − consumed (column K)", () => {
    // Row 3: (1980 + 1157) − 1450 = 1687
    expect(dayMetrics(marchPlan, marchEntries[0], targets).dailyDeficit).toBe(1687);
    // Row 15, the best day: (1980 + 1354) − 1323 = 2011
    expect(dayMetrics(marchPlan, marchEntries[10], targets).dailyDeficit).toBe(2011);
  });

  it("computes deficit-to-plan against the daily requirement (column L)", () => {
    expect(
      dayMetrics(marchPlan, marchEntries[0], targets).deficitToPlan,
    ).toBeCloseTo(520.33333333333, 6);
    // Row 7 fell short of pace and must read negative.
    expect(
      dayMetrics(marchPlan, marchEntries[4], targets).deficitToPlan,
    ).toBeCloseTo(-72.66666666667, 6);
  });

  it("numbers days from the plan start", () => {
    expect(dayMetrics(marchPlan, marchEntries[0], targets).dayNumber).toBe(1);
    expect(dayMetrics(marchPlan, marchEntries[11], targets).dayNumber).toBe(14);
  });

  it("leaves the deficit null until calories are logged", () => {
    const weighedOnly = row("2026-03-20", 221.0, 0.25, null, null, null, null, null);
    const metrics = dayMetrics(marchPlan, weighedOnly, targets);

    expect(metrics.dailyDeficit).toBeNull();
    expect(metrics.deficitToPlan).toBeNull();
    expect(metrics.hitDeficitGoal).toBeNull();
    // A weight on its own still counts as a logged day.
    expect(metrics.hasAnyData).toBe(true);
  });

  it("treats missing active calories as zero, matching the sheet", () => {
    const foodOnly = row("2026-03-20", null, null, null, null, null, 1500, null);
    const metrics = dayMetrics(marchPlan, foodOnly, targets);

    expect(metrics.dailyDeficit).toBe(480); // 1980 + 0 − 1500
    // But the exercise goal is unknown rather than failed.
    expect(metrics.hitActiveGoal).toBeNull();
  });

  it("judges the food and exercise goals independently", () => {
    const metrics = dayMetrics(marchPlan, marchEntries[4], targets);
    expect(metrics.hitFoodGoal).toBe(false); // ate 2507 against a 1813 ceiling
    expect(metrics.hitActiveGoal).toBe(true); // burned 1621 against a 1000 floor
  });

  it("reports an entirely empty day as having no data", () => {
    const blank = row("2026-03-20", null, null, null, null, null, null, null);
    expect(dayMetrics(marchPlan, blank, targets).hasAnyData).toBe(false);
  });
});

describe("planProgress", () => {
  const progress = planProgress(marchPlan, marchEntries, "2026-03-16");

  it("banks the same total deficit as SUM(K)", () => {
    expect(progress.deficitBanked).toBeCloseTo(18123, 6);
  });

  it("leaves the same remaining deficit as cell O12", () => {
    expect(progress.deficitRemaining).toBeCloseTo(16877, 6);
  });

  it("accumulates the same deficit-to-plan as cell O13", () => {
    expect(progress.cumulativeToPlan).toBeCloseTo(4123, 6);
  });

  it("counts only days with calories toward the average", () => {
    // Twelve logged days, not the fourteen the calendar has elapsed.
    expect(progress.daysLogged).toBe(12);
    expect(progress.daysElapsed).toBe(14);
    expect(progress.averageDailyDeficit).toBeCloseTo(18123 / 12, 6);
  });

  describe("weight (cells R3 and R5)", () => {
    it("reports pounds lost against the latest reading", () => {
      expect(progress.weight.current).toBeCloseTo(1.0, 6);
    });

    it("reports pounds lost at the best point ever reached", () => {
      expect(progress.weight.max).toBeCloseTo(2.3, 6);
    });

    it("reports how far the current reading has slipped from that best", () => {
      expect(progress.weight.offBest).toBeCloseTo(1.3, 6);
    });
  });

  describe("body fat (cells R4 and R6)", () => {
    it("reports body fat lost against the latest reading", () => {
      expect(progress.bodyFat.current).toBeCloseTo(0.005, 6);
    });

    it("reports body fat lost at the best point ever reached", () => {
      expect(progress.bodyFat.max).toBeCloseTo(0.016, 6);
    });
  });

  describe("blood pressure (cells R9 through R12)", () => {
    it("reports systolic improvement, current and best", () => {
      expect(progress.systolic.current).toBeCloseTo(11, 6);
      expect(progress.systolic.max).toBeCloseTo(20, 6);
    });

    it("reports diastolic improvement, current and best", () => {
      expect(progress.diastolic.current).toBeCloseTo(12, 6);
      expect(progress.diastolic.max).toBeCloseTo(19, 6);
    });

    it("ignores the two days blood pressure was never taken", () => {
      expect(progress.systolic.count).toBe(11);
      expect(progress.weight.count).toBe(12);
    });
  });

  describe("VO2 max (cell R13)", () => {
    it("counts upward, where higher is the improvement", () => {
      expect(progress.vo2Max.max).toBeCloseTo(1.9, 6);
      expect(progress.vo2Max.current).toBeCloseTo(1.9, 6);
      expect(progress.vo2Max.best).toBeCloseTo(37.3, 6);
    });
  });

  it("scans the whole plan for personal bests, not a fixed row range", () => {
    // The regression the spreadsheet had: a best set late in the plan was
    // invisible because the range stopped short. Day 30 must count.
    const lateBest = [
      ...marchEntries,
      row("2026-04-01", 210.0, 0.24, 40.0, 110, 70, 1200, 1400),
    ];
    const withLate = planProgress(marchPlan, lateBest, "2026-04-01");

    expect(withLate.weight.max).toBeCloseTo(14.9, 6);
    expect(withLate.vo2Max.max).toBeCloseTo(4.6, 6);
    expect(withLate.systolic.max).toBeCloseTo(24, 6);
  });

  it("never reports a negative personal best before any progress is made", () => {
    // Every reading heavier than the baseline: best-so-far is simply zero.
    const heavier = [row("2026-03-03", 230.0, null, null, null, null, null, null)];
    const gained = planProgress(marchPlan, heavier, "2026-03-03");

    expect(gained.weight.max).toBe(0);
    expect(gained.weight.current).toBeCloseTo(-5.1, 6);
    expect(gained.weight.offBest).toBeCloseTo(5.1, 6);
  });

  it("ignores entries outside the plan's date range", () => {
    const strays = [
      ...marchEntries,
      row("2026-03-01", 100, null, null, null, null, 100, 100), // before the start
      row("2026-05-01", 100, null, null, null, null, 100, 100), // after the end
    ];
    const filtered = planProgress(marchPlan, strays, "2026-03-16");

    expect(filtered.deficitBanked).toBeCloseTo(18123, 6);
    expect(filtered.weight.count).toBe(12);
  });

  it("projects the finish from the current average", () => {
    // 18123 banked over 12 logged days, carried across the 16 days remaining.
    const average = 18123 / 12;
    const projectedTotal = 18123 + average * 16;

    expect(progress.daysRemaining).toBe(16);
    expect(progress.projectedLbsLost).toBeCloseTo(projectedTotal / 3500, 6);
    expect(progress.projectedEndWeight).toBeCloseTo(
      224.9 - projectedTotal / 3500,
      6,
    );
  });

  it("states what the remaining days now require", () => {
    expect(progress.requiredDailyDeficitFromHere).toBeCloseTo(16877 / 16, 6);
  });

  it("distinguishes pounds on the scale from pounds implied by calories", () => {
    expect(progress.lbsLostByScale).toBeCloseTo(1.0, 6);
    expect(progress.lbsLostByDeficit).toBeCloseTo(18123 / 3500, 6);
  });

  it("handles a plan with nothing logged at all", () => {
    const empty = planProgress(marchPlan, [], "2026-03-03");

    expect(empty.deficitBanked).toBe(0);
    expect(empty.deficitRemaining).toBe(35000);
    expect(empty.daysLogged).toBe(0);
    expect(empty.averageDailyDeficit).toBeNull();
    expect(empty.projectedEndWeight).toBeNull();
    expect(empty.weight.current).toBeNull();
    expect(empty.weight.max).toBe(0);
  });

  it("clamps elapsed days to the plan length once it is over", () => {
    const after = planProgress(marchPlan, marchEntries, "2026-06-01");

    expect(after.daysElapsed).toBe(30);
    expect(after.daysRemaining).toBe(0);
    expect(after.requiredDailyDeficitFromHere).toBeNull();
  });
});

describe("series", () => {
  it("emits only the days carrying the metric, leaving gaps as gaps", () => {
    const points = series(marchPlan, marchEntries, (e) => e.systolic);

    expect(points).toHaveLength(11);
    // 3/14 had no blood pressure, so day 12 is absent and day 13 follows day 9.
    expect(points.map((p) => p.dayNumber)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 13, 14,
    ]);
    expect(points.every((p) => p.value > 0)).toBe(true);
  });

  it("sorts by date regardless of input order", () => {
    const shuffled = [marchEntries[5], marchEntries[0], marchEntries[2]];
    const points = series(marchPlan, shuffled, (e) => e.weight);

    expect(points.map((p) => p.date)).toEqual([
      "2026-03-03",
      "2026-03-05",
      "2026-03-08",
    ]);
  });
});
