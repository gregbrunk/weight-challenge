import { describe, expect, it } from "vitest";
import {
  buildChartRows,
  hasData,
  paddedDomain,
  tickInterval,
} from "./chart-data";
import type { EntryInput, PlanInput } from "./calc";

const plan: PlanInput = {
  startDate: "2026-08-25",
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

function entry(date: string, fields: Partial<EntryInput> = {}): EntryInput {
  return {
    date,
    weight: null,
    bodyFat: null,
    vo2Max: null,
    systolic: null,
    diastolic: null,
    consumedCals: null,
    activeCals: null,
    ...fields,
  };
}

describe("buildChartRows", () => {
  it("emits one row per day from the start through today", () => {
    const rows = buildChartRows(plan, [], "2026-08-29");

    expect(rows).toHaveLength(5);
    expect(rows[0].date).toBe("2026-08-25");
    expect(rows[0].day).toBe(1);
    expect(rows[4].date).toBe("2026-08-29");
    expect(rows[4].day).toBe(5);
  });

  it("stops at today rather than running to the end of the plan", () => {
    // Otherwise two thirds of the chart is empty future and the real data is
    // squeezed into a corner.
    const rows = buildChartRows(plan, [], "2026-08-27");
    expect(rows).toHaveLength(3);
  });

  it("never runs past the plan's last day", () => {
    const rows = buildChartRows(plan, [], "2027-01-01");
    expect(rows).toHaveLength(93);
    expect(rows[92].date).toBe("2026-11-25");
  });

  it("renders a single row for a plan that hasn't started", () => {
    const rows = buildChartRows(plan, [], "2026-01-01");
    expect(rows).toHaveLength(1);
  });

  it("leaves unlogged days null rather than dropping or zeroing them", () => {
    const rows = buildChartRows(
      plan,
      [entry("2026-08-25", { weight: 232.6 }), entry("2026-08-27", { weight: 231.2 })],
      "2026-08-27",
    );

    expect(rows.map((row) => row.weight)).toEqual([232.6, null, 231.2]);
  });

  it("converts body fat from a stored fraction to plotted percentage points", () => {
    const rows = buildChartRows(plan, [entry("2026-08-25", { bodyFat: 0.299 })], "2026-08-25");
    expect(rows[0].bodyFat).toBeCloseTo(29.9, 10);
  });

  it("carries each metric independently, since they're logged at different times", () => {
    const rows = buildChartRows(
      plan,
      [entry("2026-08-25", { weight: 232.6, systolic: 128, diastolic: 84 })],
      "2026-08-25",
    );

    expect(rows[0].weight).toBe(232.6);
    expect(rows[0].vo2Max).toBeNull();
    expect(rows[0].systolic).toBe(128);
  });

  it("ignores entries outside the window", () => {
    const rows = buildChartRows(
      plan,
      [entry("2026-08-24", { weight: 999 }), entry("2026-09-30", { weight: 111 })],
      "2026-08-26",
    );

    expect(rows.every((row) => row.weight === null)).toBe(true);
  });

  describe("the goal line", () => {
    it("starts at the starting weight and ends at the target", () => {
      const full = buildChartRows(plan, [], "2026-11-25");

      expect(full[0].weightGoal).toBeCloseTo(232.6, 6);
      expect(full[92].weightGoal).toBeCloseTo(199.6, 6);
    });

    it("is halfway down at the halfway point", () => {
      const full = buildChartRows(plan, [], "2026-11-25");
      expect(full[46].weightGoal).toBeCloseTo(232.6 - 16.5, 6);
    });

    it("is absent when no starting weight was recorded", () => {
      const rows = buildChartRows({ ...plan, startWeight: null }, [], "2026-08-26");
      expect(rows.every((row) => row.weightGoal === null)).toBe(true);
    });

    it("doesn't divide by zero on a one-day plan", () => {
      const rows = buildChartRows({ ...plan, days: 1 }, [], "2026-08-25");
      expect(rows[0].weightGoal).toBeCloseTo(199.6, 6);
    });
  });
});

describe("paddedDomain", () => {
  it("pads around the data so a small change isn't drawn as a cliff", () => {
    const [min, max] = paddedDomain([230, 232])!;

    expect(min).toBeLessThan(230);
    expect(max).toBeGreaterThan(232);
  });

  it("ignores nulls", () => {
    expect(paddedDomain([null, 100, null, 110])).not.toBeNull();
  });

  it("returns null when there's nothing to plot", () => {
    expect(paddedDomain([])).toBeNull();
    expect(paddedDomain([null, null])).toBeNull();
  });

  it("enforces a minimum span for a flat series", () => {
    // A single repeated reading would otherwise produce a zero-height domain.
    const [min, max] = paddedDomain([200, 200], { minSpan: 2 })!;
    expect(max - min).toBeGreaterThan(0);
  });

  it("handles a single reading", () => {
    const domain = paddedDomain([232.6]);
    expect(domain).not.toBeNull();
    expect(domain![0]).toBeLessThan(232.6);
    expect(domain![1]).toBeGreaterThan(232.6);
  });
});

describe("hasData", () => {
  const rows = buildChartRows(plan, [entry("2026-08-25", { weight: 232.6 })], "2026-08-26");

  it("is true for a series with any reading", () => {
    expect(hasData(rows, "weight")).toBe(true);
  });

  it("is false for a series never logged, so its chart can be skipped", () => {
    expect(hasData(rows, "vo2Max")).toBe(false);
    expect(hasData(rows, "systolic")).toBe(false);
  });
});

describe("tickInterval", () => {
  it("thins labels so a 93-day axis stays readable", () => {
    // Recharts skips `interval` ticks between each label.
    const interval = tickInterval(93, 6);
    expect(Math.ceil(93 / (interval + 1))).toBeLessThanOrEqual(7);
  });

  it("labels every point when there are only a few", () => {
    expect(tickInterval(4, 6)).toBe(0);
  });

  it("never returns a negative interval", () => {
    expect(tickInterval(0)).toBe(0);
    expect(tickInterval(1)).toBe(0);
  });
});
