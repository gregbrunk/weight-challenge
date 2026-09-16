"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDuration } from "@/lib/format";
import type { FastingBar } from "@/lib/fasting";

export interface FastingWeekView {
  /** Sunday, used as the key and as what the buttons step between. */
  start: string;
  label: string;
  bars: FastingBar[];
}

/**
 * What a day with no bar means, said plainly in the tooltip.
 *
 * The chart draws nothing for all three, which on its own is ambiguous — a day
 * outside the plan and a day you simply didn't fast look identical.
 */
const NO_BAR_REASON: Record<string, string> = {
  running: "Still fasting",
  none: "No fast logged",
  outside: "Outside the plan",
};

/**
 * A week of fasts, seven bars wide.
 *
 * Every week of the plan is computed on the server and handed over together,
 * so stepping between them is instant and needs no round trip — a plan is at
 * most a few dozen weeks, which is far less data than the charts above it.
 *
 * Green cleared the goal, red fell short, and a missing bar means no fast was
 * measured that day. That last one is the app's rule everywhere: absent is not
 * zero. It is *also* counted as a missed day in the figures below, which is not
 * a contradiction — there is nothing to draw, and still nothing achieved.
 */
export function FastingWeekChart({
  weeks,
  goalHours,
}: {
  weeks: FastingWeekView[];
  goalHours: number;
}) {
  // Opens on the most recent week, which is the one you came to look at.
  const [index, setIndex] = useState(Math.max(weeks.length - 1, 0));
  const week = weeks[index];

  if (!week) return null;

  return (
    <section className="card" aria-labelledby="fasting-week-heading">
      <div className="chart-head">
        <div>
          <h3 id="fasting-week-heading" className="chart-title">
            Hours fasted
          </h3>
          <p className="chart-description">{week.label}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setIndex((current) => current - 1)}
            disabled={index === 0}
            aria-label="Previous week"
          >
            ‹
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setIndex((current) => current + 1)}
            disabled={index >= weeks.length - 1}
            aria-label="Next week"
          >
            ›
          </button>
        </div>
      </div>

      <div className="chart-frame">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={week.bars} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} className="chart-grid" />

            <XAxis
              dataKey="weekday"
              tickLine={false}
              axisLine={false}
              className="chart-axis"
              tickMargin={12}
              height={36}
            />
            <YAxis
              domain={[0, 24]}
              ticks={[0, 6, 12, 18, 24]}
              tickLine={false}
              axisLine={false}
              className="chart-axis"
              width={40}
              tickFormatter={(value: number) => `${value}h`}
            />

            {/* The line the bars are being judged against. */}
            <ReferenceLine
              y={goalHours}
              className="fasting-goal-line"
              strokeDasharray="4 4"
              ifOverflow="extendDomain"
            />

            <Tooltip
              content={(props) => (
                <FastingTooltip
                  active={props.active}
                  bar={
                    (props.payload?.[0]?.payload as FastingBar | undefined) ?? undefined
                  }
                  goalHours={goalHours}
                />
              )}
              cursor={{ className: "chart-cursor-band" }}
            />

            <Bar dataKey="hours" isAnimationActive={false} radius={[4, 4, 0, 0]}>
              {week.bars.map((bar) => (
                <Cell
                  key={bar.date}
                  className={bar.state === "met" ? "fasting-bar-met" : "fasting-bar-missed"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function FastingTooltip({
  active,
  bar,
  goalHours,
}: {
  active?: boolean;
  bar?: FastingBar;
  goalHours: number;
}) {
  if (!active || !bar) return null;

  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-date label-caps">{bar.label}</p>
      {bar.hours === null ? (
        <p className="chart-tooltip-row">{NO_BAR_REASON[bar.state] ?? "No fast logged"}</p>
      ) : (
        <p className="chart-tooltip-row">
          {formatDuration(bar.hours)} ·{" "}
          {bar.state === "met" ? `met ${goalHours}h` : `short of ${goalHours}h`}
        </p>
      )}
    </div>
  );
}
