// @vitest-environment happy-dom

/**
 * Renders the chart for real.
 *
 * The browser pane refused to load localhost for most of this build, so this
 * is how the chart gets exercised rather than only reasoned about: it catches
 * a component that throws on mount, a series wired to the wrong field, and —
 * the thing that actually matters — a gap in the data being drawn as an
 * unbroken line.
 *
 * It already earned its place: it caught the series className landing on the
 * wrapping <g> rather than the <path>, which meant the stylesheet was missing
 * every line and the charts would have shipped in Recharts' default blue.
 *
 * ResponsiveContainer measures its parent, which has no layout in a test DOM,
 * so it is handed explicit dimensions. Everything below it is the real
 * Recharts.
 */

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";

vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  const React = await vi.importActual<typeof import("react")>("react");

  return {
    ...actual,
    // ResponsiveContainer measures its parent through ResizeObserver, and a
    // test DOM has no layout, so it settles on zero and the chart draws empty
    // paths. Handing the chart explicit dimensions skips measurement entirely;
    // everything below it is the real Recharts.
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
      React.cloneElement(children as React.ReactElement<{ width: number; height: number }>, {
        width: 640,
        height: 280,
      }),
  };
});

const { MetricChart } = await import("./metric-chart");
const { buildChartRows } = await import("@/lib/chart-data");
const type = await import("@/lib/calc");

afterEach(cleanup);

const plan: import("@/lib/calc").PlanInput = {
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

function entry(date: string, weight: number | null): import("@/lib/calc").EntryInput {
  return {
    date,
    weight,
    bodyFat: null,
    vo2Max: null,
    systolic: null,
    diastolic: null,
    consumedCals: null,
    activeCals: null,
  };
}

/** Five days, with the middle one unlogged. */
const rowsWithGap = buildChartRows(
  plan,
  [
    entry("2026-08-05", 232.6),
    entry("2026-08-06", 231.8),
    // 2026-08-07 deliberately missing
    entry("2026-08-08", 231.0),
    entry("2026-08-09", 230.4),
  ],
  "2026-08-09",
);

const weightSeries = [
  { key: "weight" as const, label: "Weight", className: "series-weight" },
];

function bp(
  date: string,
  systolic: number | null,
  diastolic: number | null,
): import("@/lib/calc").EntryInput {
  return { ...entry(date, null), systolic, diastolic };
}

const bpSeries = [
  { key: "systolic" as const, label: "Systolic", className: "series-systolic" },
  { key: "diastolic" as const, label: "Diastolic", className: "series-diastolic" },
];

describe("MetricChart", () => {
  it("renders without throwing", () => {
    render(<MetricChart title="Weight" rows={rowsWithGap} series={weightSeries} />);
    expect(screen.getByText("Weight", { selector: "h3" })).toBeTruthy();
  });

  it("shows a legend entry per series", () => {
    render(
      <MetricChart
        title="Blood pressure"
        rows={buildChartRows(plan, [], "2026-08-09")}
        decimals={0}
        series={[
          { key: "systolic", label: "Systolic", className: "series-systolic" },
          { key: "diastolic", label: "Diastolic", className: "series-diastolic" },
        ]}
      />,
    );

    const items = document.querySelectorAll(".chart-legend-item");
    expect(items).toHaveLength(2);
    expect(screen.getByText("Systolic")).toBeTruthy();
    expect(screen.getByText("Diastolic")).toBeTruthy();
  });

  it("puts the series class where the stylesheet expects it", () => {
    const { container } = render(
      <MetricChart title="Weight" rows={rowsWithGap} series={weightSeries} />,
    );

    // Recharts applies a Line's className to the wrapping <g>, not to the
    // <path>. The stylesheet therefore reaches the stroke with a descendant
    // selector, and this asserts that structure holds — get it wrong and every
    // chart silently renders in Recharts' default blue instead of the tokens.
    const group = container.querySelector("g.chart-line.series-weight");
    expect(group).toBeTruthy();
    expect(group?.querySelector(".recharts-curve")).toBeTruthy();
  });

  it("breaks the line at an unlogged day instead of drawing through it", () => {
    const { container } = render(
      <MetricChart title="Weight" rows={rowsWithGap} series={weightSeries} />,
    );

    const path = container.querySelector(".chart-line.series-weight .recharts-curve");
    const d = path?.getAttribute("d") ?? "";

    // A broken line restarts with a fresh move command. One "M" would mean
    // Recharts connected straight across the missing day — the exact thing
    // connectNulls={false} exists to prevent.
    const moveCommands = d.match(/M/g)?.length ?? 0;
    expect(moveCommands).toBeGreaterThan(1);
  });

  it("draws one continuous line when nothing is missing", () => {
    const complete = buildChartRows(
      plan,
      [
        entry("2026-08-05", 232.6),
        entry("2026-08-06", 231.8),
        entry("2026-08-07", 231.4),
      ],
      "2026-08-07",
    );

    const { container } = render(
      <MetricChart title="Weight" rows={complete} series={weightSeries} />,
    );

    const d =
      container
        .querySelector(".chart-line.series-weight .recharts-curve")
        ?.getAttribute("d") ?? "";
    expect(d.match(/M/g)?.length ?? 0).toBe(1);
  });

  it("renders a reference line as well as the data line", () => {
    const { container } = render(
      <MetricChart
        title="Weight"
        rows={rowsWithGap}
        series={[
          { key: "weightGoal", label: "On pace", className: "series-goal", reference: true },
          ...weightSeries,
        ]}
      />,
    );

    expect(
      container.querySelector(".chart-line-reference.series-goal .recharts-curve"),
    ).toBeTruthy();
    expect(
      container.querySelector(".chart-line.series-weight .recharts-curve"),
    ).toBeTruthy();
  });

  /**
   * A single reading with no logged day either side produces a path of one
   * point. That path is zero-length — "M238,27Z" — so with dots off it paints
   * nothing, and a chart you have just logged a measurement into comes up
   * blank. This is what the Blood pressure chart was doing.
   */
  it("shows a lone reading that has no line to draw", () => {
    const single = buildChartRows(plan, [bp("2026-08-06", 130, 80)], "2026-08-09");
    const { container } = render(
      <MetricChart title="Blood pressure" rows={single} series={bpSeries} decimals={0} />,
    );

    const path = container.querySelector(
      ".chart-line.series-systolic .recharts-curve",
    );
    // The path really is zero-length; the dot is what makes the reading visible.
    expect(path?.getAttribute("d") ?? "").toMatch(/^M[\d.,]+Z?$/);

    const dot = container.querySelector("circle.chart-dot.series-systolic");
    expect(dot).toBeTruthy();
  });

  it("marks both series when only one day is logged", () => {
    const single = buildChartRows(plan, [bp("2026-08-06", 130, 80)], "2026-08-09");
    const { container } = render(
      <MetricChart title="Blood pressure" rows={single} series={bpSeries} decimals={0} />,
    );

    expect(container.querySelector("circle.chart-dot.series-systolic")).toBeTruthy();
    expect(container.querySelector("circle.chart-dot.series-diastolic")).toBeTruthy();
  });

  /** Dots are for rescuing invisible points, not for decorating every day. */
  it("draws no dots when the readings already form a line", () => {
    const pair = buildChartRows(
      plan,
      [bp("2026-08-06", 130, 80), bp("2026-08-07", 128, 79)],
      "2026-08-09",
    );
    const { container } = render(
      <MetricChart title="Blood pressure" rows={pair} series={bpSeries} decimals={0} />,
    );

    expect(container.querySelectorAll("circle.chart-dot.series-systolic")).toHaveLength(0);
  });

  /**
   * Two readings with a gap between them are two isolated points, not a line —
   * connectNulls is off, so neither has a neighbour to join.
   */
  it("marks each side of a gap that is too wide to bridge", () => {
    const split = buildChartRows(
      plan,
      [bp("2026-08-05", 132, 82), bp("2026-08-09", 126, 78)],
      "2026-08-09",
    );
    const { container } = render(
      <MetricChart title="Blood pressure" rows={split} series={bpSeries} decimals={0} />,
    );

    expect(container.querySelectorAll("circle.chart-dot.series-systolic")).toHaveLength(2);
  });

  it("renders the frame even when every value is null", () => {
    // An empty series must not crash the page; the axes still draw.
    const empty = buildChartRows(plan, [], "2026-08-09");
    const { container } = render(
      <MetricChart title="VO2 max" rows={empty} series={[
        { key: "vo2Max", label: "VO2 max", className: "series-vo2" },
      ]} />,
    );

    expect(container.querySelector(".recharts-surface")).toBeTruthy();
  });

  it("does not animate, so the chart doesn't redraw on every visit", () => {
    const { container } = render(
      <MetricChart title="Weight" rows={rowsWithGap} series={weightSeries} />,
    );

    // Recharts adds this class only while animating.
    expect(container.querySelector(".recharts-line-curve.animate")).toBeNull();
  });
});

// Referenced so the type-only import above isn't elided as unused.
void type;
