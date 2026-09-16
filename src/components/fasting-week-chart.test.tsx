// @vitest-environment happy-dom

/**
 * Renders the fasting week for real.
 *
 * The thing worth catching here is the same one that nearly shipped the line
 * charts in Recharts' default blue: a className that lands somewhere the
 * stylesheet can't reach. A bar chart whose colours don't apply looks fine and
 * says nothing — every day the same shade, met and missed indistinguishable.
 *
 * So these assert on the rendered SVG rather than on props: that a met day and
 * a missed day get different classes, that a day with no fast draws no bar at
 * all, and that stepping between weeks stops at both ends.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  const React = await vi.importActual<typeof import("react")>("react");

  return {
    ...actual,
    // No layout in a test DOM, so ResponsiveContainer would settle on zero and
    // draw nothing. Everything below this is the real Recharts.
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
      React.cloneElement(children as React.ReactElement<{ width: number; height: number }>, {
        width: 640,
        height: 280,
      }),
  };
});

const { FastingWeekChart } = await import("./fasting-week-chart");
const { fastingBars } = await import("@/lib/fasting");

afterEach(cleanup);

const plan: import("@/lib/calc").PlanInput = {
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
};

function entry(
  date: string,
  fields: Partial<import("@/lib/calc").EntryInput> = {},
): import("@/lib/calc").EntryInput {
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

/**
 * The week of Sunday 13 September. Monday clears the goal at 18h, Tuesday falls
 * short at 15h, and nothing else is logged.
 */
const logged = new Map(
  [
    entry("2026-09-13", { fastStartAt: new Date("2026-09-14T00:30:00Z") }),
    entry("2026-09-14", {
      fastEndAt: new Date("2026-09-14T18:30:00Z"),
      fastStartAt: new Date("2026-09-15T00:30:00Z"),
    }),
    entry("2026-09-15", { fastEndAt: new Date("2026-09-15T15:30:00Z") }),
  ].map((row) => [row.date, row] as const),
);

const weeks = [
  { start: "2026-09-06", label: "Sep 6 – Sep 12", bars: fastingBars(plan, new Map(), "2026-09-06") },
  { start: "2026-09-13", label: "Sep 13 – Sep 19", bars: fastingBars(plan, logged, "2026-09-13") },
];

const bars = () => document.querySelectorAll(".recharts-bar-rectangle");

describe("FastingWeekChart", () => {
  it("opens on the most recent week", () => {
    render(<FastingWeekChart weeks={weeks} goalHours={18} />);
    expect(screen.getByText("Sep 13 – Sep 19")).toBeTruthy();
  });

  it("draws a bar only for the days a fast was completed", () => {
    render(<FastingWeekChart weeks={weeks} goalHours={18} />);
    // Seven days in the week, two completed fasts.
    expect(bars()).toHaveLength(2);
  });

  it("colours the met day and the missed day differently", () => {
    render(<FastingWeekChart weeks={weeks} goalHours={18} />);

    expect(document.querySelectorAll(".fasting-bar-met")).toHaveLength(1);
    expect(document.querySelectorAll(".fasting-bar-missed")).toHaveLength(1);
  });

  it("puts those classes on the path the stylesheet targets", () => {
    render(<FastingWeekChart weeks={weeks} goalHours={18} />);

    // The specific selector in globals.css. A Line's className lands on a
    // wrapping <g> and this one does not, which is the difference that once
    // shipped every chart in Recharts' default blue.
    expect(document.querySelectorAll("path.fasting-bar-met")).toHaveLength(1);
    expect(document.querySelectorAll("path.fasting-bar-missed")).toHaveLength(1);
    // The goal line IS wrapped, so its stroke is reached through a descendant.
    expect(document.querySelectorAll(".fasting-goal-line line").length).toBeGreaterThan(0);
  });

  it("draws nothing at all for a week with no fasts", () => {
    render(<FastingWeekChart weeks={weeks} goalHours={18} />);
    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));

    expect(screen.getByText("Sep 6 – Sep 12")).toBeTruthy();
    expect(bars()).toHaveLength(0);
  });

  it("stops at the first week and at the last", () => {
    render(<FastingWeekChart weeks={weeks} goalHours={18} />);

    const previous = screen.getByRole("button", { name: "Previous week" });
    const next = screen.getByRole("button", { name: "Next week" });

    // Opens on the last week, so there is nowhere forward to go.
    expect(next.hasAttribute("disabled")).toBe(true);
    expect(previous.hasAttribute("disabled")).toBe(false);

    fireEvent.click(previous);
    expect(previous.hasAttribute("disabled")).toBe(true);
    expect(next.hasAttribute("disabled")).toBe(false);
  });

  it("labels every day of the week, logged or not", () => {
    render(<FastingWeekChart weeks={weeks} goalHours={18} />);

    for (const day of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) {
      expect(screen.getByText(day)).toBeTruthy();
    }
  });
});
