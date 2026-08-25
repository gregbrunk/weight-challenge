"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartRow } from "@/lib/chart-data";
import { paddedDomain, tickInterval } from "@/lib/chart-data";
import { EM_DASH } from "@/lib/format";

export interface ChartSeries {
  /** Which field of the row to plot. */
  key: keyof ChartRow;
  label: string;
  /** CSS class carrying the stroke colour, e.g. "series-weight". */
  className: string;
  /** Reference lines are thinner and dashed, and sit behind the real data. */
  reference?: boolean;
}

interface Props {
  title: string;
  description?: string;
  rows: ChartRow[];
  series: ChartSeries[];
  unit?: string;
  decimals?: 0 | 1;
  /** Minimum height of the y domain, so a flat series isn't drawn as noise. */
  minSpan?: number;
}

/**
 * A line chart over the plan's days.
 *
 * Colours come from CSS classes rather than props, because Recharts writes
 * `stroke` as an SVG presentation attribute and browsers don't resolve `var()`
 * in those. A CSS rule beats a presentation attribute, so styling by class
 * lets the design tokens apply — and means the chart re-colours itself when the
 * system flips to dark without any JavaScript noticing.
 *
 * Animation is off. It replays on every navigation, and this is a screen you
 * check daily; a chart that redraws itself each time is noise, not delight.
 * It also removes any need to special-case reduced-motion.
 */
export function MetricChart({
  title,
  description,
  rows,
  series,
  unit,
  decimals = 1,
  minSpan = 1,
}: Props) {
  const plotted = series.filter((entry) => !entry.reference);
  const values = rows.flatMap((row) =>
    series.map((entry) => row[entry.key] as number | null),
  );
  const domain = paddedDomain(values, { minSpan });

  return (
    <section className="card" aria-labelledby={`chart-${title}`}>
      <div className="chart-head">
        <div>
          <h3 id={`chart-${title}`} className="chart-title">
            {title}
          </h3>
          {description && <p className="chart-description">{description}</p>}
        </div>

        <ul className="chart-legend">
          {series.map((entry) => (
            <li key={String(entry.key)} className="chart-legend-item">
              <span
                aria-hidden="true"
                className={`chart-swatch ${entry.className}${entry.reference ? " chart-swatch-reference" : ""}`}
              />
              {entry.label}
            </li>
          ))}
        </ul>
      </div>

      <div className="chart-frame">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid vertical={false} className="chart-grid" />

            <XAxis
              dataKey="label"
              interval={tickInterval(rows.length)}
              tickLine={false}
              axisLine={false}
              className="chart-axis"
              minTickGap={8}
            />
            <YAxis
              domain={domain ?? ["auto", "auto"]}
              tickLine={false}
              axisLine={false}
              className="chart-axis"
              width={48}
              tickFormatter={(value: number) => value.toFixed(decimals)}
            />

            <Tooltip
              content={(props) => (
                <ChartTooltip
                  active={props.active}
                  payload={props.payload as TooltipPayload}
                  series={series}
                  unit={unit}
                  decimals={decimals}
                />
              )}
              // The default cursor is a heavy filled band; a thin line is
              // enough to say which day you're reading.
              cursor={{ className: "chart-cursor", strokeWidth: 1 }}
            />

            {/* Reference lines render first so real data sits on top. */}
            {series
              .filter((entry) => entry.reference)
              .map((entry) => (
                <Line
                  key={String(entry.key)}
                  type="linear"
                  dataKey={String(entry.key)}
                  className={`chart-line chart-line-reference ${entry.className}`}
                  strokeDasharray="4 4"
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              ))}

            {plotted.map((entry) => (
              <Line
                key={String(entry.key)}
                type="monotone"
                dataKey={String(entry.key)}
                className={`chart-line ${entry.className}`}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, className: `chart-dot ${entry.className}` }}
                isAnimationActive={false}
                // The load-bearing prop: a day without a reading is a gap, not
                // a straight line implying progress that was never measured.
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

/**
 * Only the part of Recharts' tooltip payload this chart reads. Recharts' own
 * generics over value and name types don't survive being narrowed here, and
 * every value we need is on the row anyway.
 */
type TooltipPayload = ReadonlyArray<{ payload?: unknown }> | undefined;

function ChartTooltip({
  active,
  payload,
  series,
  unit,
  decimals,
}: {
  active?: boolean;
  payload: TooltipPayload;
  series: ChartSeries[];
  unit?: string;
  decimals: 0 | 1;
}) {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload as ChartRow | undefined;
  if (!row) return null;

  return (
    <div className="chart-tooltip">
      <p className="label-caps chart-tooltip-date">
        {row.label} · Day {row.day}
      </p>

      {series.map((entry) => {
        const value = row[entry.key] as number | null;

        return (
          <p key={String(entry.key)} className="chart-tooltip-row">
            <span
              aria-hidden="true"
              className={`chart-swatch ${entry.className}${entry.reference ? " chart-swatch-reference" : ""}`}
            />
            <span className="chart-tooltip-label">{entry.label}</span>
            <span className="numeric chart-tooltip-value">
              {value === null ? EM_DASH : value.toFixed(decimals)}
              {value !== null && unit ? unit : ""}
            </span>
          </p>
        );
      })}
    </div>
  );
}
