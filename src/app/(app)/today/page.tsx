import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DateNav } from "@/components/date-nav";
import { dayMetrics, planTargets, type EntryInput } from "@/lib/calc";
import { compareDates, daysBetween, isPlainDate, type PlainDate } from "@/lib/date";
import {
  EM_DASH,
  formatBloodPressure,
  formatBodyFat,
  formatCalories,
  formatSigned,
  formatSignedCalories,
  formatVo2,
  formatWeight,
} from "@/lib/format";
import {
  getActivePlan,
  getEntryInputs,
  toPlanInput,
} from "@/lib/plans";
import { getToday } from "@/lib/timezone-server";

export const metadata: Metadata = {
  title: "Today · Weight Challenge",
};

export default async function TodayPage({ searchParams }: PageProps<"/today">) {
  const plan = await getActivePlan();
  if (!plan) redirect("/plan/new");

  const planInput = toPlanInput(plan);
  const targets = planTargets(planInput);
  const today = await getToday();

  const date = resolveDate(
    (await searchParams).date,
    today,
    planInput.startDate,
    targets.endDate,
  );

  const entries = await getEntryInputs(plan.id);
  const entry =
    entries.find((candidate) => candidate.date === date) ?? emptyEntry(date);
  const metrics = dayMetrics(planInput, entry, targets);

  // The last reading before today, per metric — each one moves on its own
  // schedule, so they can't share a single "yesterday".
  const previous = (pick: (input: EntryInput) => number | null): number | null => {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const candidate = entries[index];
      if (compareDates(candidate.date, date) >= 0) continue;
      const value = pick(candidate);
      if (value !== null) return value;
    }
    return null;
  };

  return (
    <>
      <header style={{ marginBottom: "var(--space-lg)" }}>
        <p className="label-caps">{plan.name}</p>
        <h1 className="page-title">Today</h1>
      </header>

      <DateNav
        basePath="/today"
        date={date}
        planStart={planInput.startDate}
        planEnd={targets.endDate}
        today={today}
        dayNumber={daysBetween(planInput.startDate, date) + 1}
        totalDays={plan.days}
      />

      <div className="flex flex-col gap-4">
        <DeficitHero
          deficit={metrics.dailyDeficit}
          toPlan={metrics.deficitToPlan}
          required={targets.necessaryDailyDeficit}
          date={date}
        />

        <section className="card" aria-labelledby="calories-heading">
          <h2 id="calories-heading" className="label-caps" style={{ marginBottom: "var(--space-lg)" }}>
            Calories
          </h2>

          <Meter
            label="Eaten"
            value={entry.consumedCals}
            limit={targets.allowedFoodCals}
            mode="ceiling"
          />
          <div style={{ height: "var(--space-lg)" }} />
          <Meter
            label="Burned"
            value={entry.activeCals}
            limit={targets.targetActiveCals}
            mode="floor"
          />
        </section>

        <section aria-labelledby="body-heading">
          <h2 id="body-heading" className="label-caps" style={{ marginBottom: "var(--space-md)" }}>
            Measurements
          </h2>

          <div className="tile-grid">
            <MetricTile
              label="Weight"
              value={formatWeight(entry.weight)}
              unit="lb"
              delta={delta(entry.weight, planInput.startWeight)}
              deltaSuffix="since start"
              lowerIsBetter
              previousDelta={delta(entry.weight, previous((e) => e.weight))}
            />
            <MetricTile
              label="Body fat"
              value={formatBodyFat(entry.bodyFat)}
              delta={
                entry.bodyFat === null || planInput.startBodyFat === null
                  ? null
                  : (entry.bodyFat - planInput.startBodyFat) * 100
              }
              deltaSuffix="pts since start"
              lowerIsBetter
            />
            <MetricTile
              label="VO2 max"
              value={formatVo2(entry.vo2Max)}
              delta={delta(entry.vo2Max, planInput.startVo2Max)}
              deltaSuffix="since start"
              lowerIsBetter={false}
            />
            <MetricTile
              label="Blood pressure"
              value={formatBloodPressure(entry.systolic, entry.diastolic)}
              delta={delta(entry.systolic, planInput.startSystolic)}
              deltaSuffix="systolic since start"
              lowerIsBetter
            />
          </div>
        </section>

        <p>
          <Link href={`/log?date=${date}`} className="btn btn-primary btn-block">
            {metrics.hasAnyData ? "Edit this day" : "Log this day"}
          </Link>
        </p>
      </div>
    </>
  );
}

/**
 * The headline: what the day actually banked, against what it needed to.
 *
 * A day with no calories logged is unlogged, not a zero-deficit day, and says
 * so — reporting "0 cal" would read as a catastrophically bad day rather than
 * an empty form.
 */
function DeficitHero({
  deficit,
  toPlan,
  required,
  date,
}: {
  deficit: number | null;
  toPlan: number | null;
  required: number;
  date: PlainDate;
}) {
  if (deficit === null) {
    return (
      <section className="card" aria-labelledby="deficit-heading">
        <h2 id="deficit-heading" className="label-caps">
          Deficit
        </h2>
        <p className="hero-value text-muted" style={{ marginBlock: "var(--space-xs)" }}>
          {EM_DASH}
        </p>
        <p className="text-muted">
          No calories logged yet. Add what you ate and burned and this fills in.
        </p>
        <p style={{ marginTop: "var(--space-md)" }}>
          <Link href={`/log?date=${date}`} className="btn btn-secondary btn-sm">
            Log calories
          </Link>
        </p>
      </section>
    );
  }

  const ahead = (toPlan ?? 0) >= 0;

  return (
    <section className="card" aria-labelledby="deficit-heading">
      <div className="flex items-start justify-between gap-3">
        <h2 id="deficit-heading" className="label-caps">
          Deficit
        </h2>
        <span className={`badge ${ahead ? "badge-success" : "badge-danger"}`}>
          <span aria-hidden="true">{ahead ? "▲" : "▼"}</span>
          {formatSignedCalories(toPlan)} to plan
        </span>
      </div>

      <p className="hero-value numeric" style={{ marginBlock: "var(--space-xs)" }}>
        {formatCalories(deficit)}
      </p>

      <p className="text-muted">
        against a target of{" "}
        <span className="numeric">{formatCalories(required)}</span> cal
        {ahead ? " — ahead of pace today" : " — behind pace today"}
      </p>
    </section>
  );
}

/**
 * A labelled bar. "ceiling" mode is a limit you stay under (food); "floor" mode
 * is a threshold you get past (exercise). Both pair the bar with a worded
 * status so the colour is never the only signal.
 */
function Meter({
  label,
  value,
  limit,
  mode,
}: {
  label: string;
  value: number | null;
  limit: number;
  mode: "ceiling" | "floor";
}) {
  if (value === null) {
    return (
      <div>
        <div className="flex items-baseline justify-between gap-3" style={{ marginBottom: "var(--space-xs)" }}>
          <span style={{ fontWeight: "var(--weight-medium)" }}>{label}</span>
          <span className="text-muted numeric">
            {EM_DASH} of {formatCalories(limit)}
          </span>
        </div>
        <div className="meter">
          <div className="meter-fill meter-fill-neutral" style={{ width: "0%" }} />
        </div>
        <p className="text-muted" style={{ fontSize: "var(--text-body-sm)", marginTop: "var(--space-2xs)" }}>
          Not logged
        </p>
      </div>
    );
  }

  const ratio = limit === 0 ? 1 : value / limit;
  const met = mode === "ceiling" ? value <= limit : value >= limit;
  const width = `${Math.min(100, Math.max(0, ratio * 100))}%`;

  const fill = met
    ? "meter-fill-good"
    : mode === "ceiling"
      ? "meter-fill-over"
      : "meter-fill-warn";

  const remaining = mode === "ceiling" ? limit - value : value - limit;
  const note = met
    ? mode === "ceiling"
      ? `${formatCalories(remaining)} cal under the ceiling`
      : `${formatCalories(remaining)} cal past the floor`
    : mode === "ceiling"
      ? `${formatCalories(Math.abs(remaining))} cal over the ceiling`
      : `${formatCalories(Math.abs(remaining))} cal short of the floor`;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3" style={{ marginBottom: "var(--space-xs)" }}>
        <span style={{ fontWeight: "var(--weight-medium)" }}>{label}</span>
        <span className="numeric">
          {formatCalories(value)}{" "}
          <span className="text-muted">of {formatCalories(limit)}</span>
        </span>
      </div>

      <div
        className="meter"
        role="meter"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={Math.round(limit)}
        aria-label={`${label}: ${Math.round(value)} of ${Math.round(limit)} calories`}
      >
        <div className={`meter-fill ${fill}`} style={{ width }} />
      </div>

      <p
        className={met ? "text-success" : mode === "ceiling" ? "text-danger" : "text-warning"}
        style={{ fontSize: "var(--text-body-sm)", marginTop: "var(--space-2xs)" }}
      >
        {met ? "✓ " : "• "}
        {note}
      </p>
    </div>
  );
}

function MetricTile({
  label,
  value,
  unit,
  delta: change,
  deltaSuffix,
  lowerIsBetter,
  previousDelta,
}: {
  label: string;
  value: string;
  unit?: string;
  delta: number | null;
  deltaSuffix: string;
  lowerIsBetter: boolean;
  previousDelta?: number | null;
}) {
  // No movement is neither good nor bad. Without this, a baseline day would
  // paint "0.0 since start" red, which reads as a bad result rather than a
  // starting point.
  const improving =
    change === null || change === 0
      ? null
      : lowerIsBetter
        ? change < 0
        : change > 0;

  return (
    <div className="card">
      <p className="label-caps">{label}</p>
      <p className="tile-value numeric">
        {value}
        {unit && value !== EM_DASH && (
          <span
            className="text-muted"
            style={{ fontSize: "var(--text-body-sm)", marginLeft: "var(--space-2xs)" }}
          >
            {unit}
          </span>
        )}
      </p>

      {change === null ? (
        <p className="tile-delta text-muted">{EM_DASH}</p>
      ) : (
        <p
          className={`tile-delta numeric ${
            improving === null ? "" : improving ? "text-success" : "text-danger"
          }`}
        >
          {formatSigned(change)} {deltaSuffix}
        </p>
      )}

      {previousDelta !== undefined && previousDelta !== null && (
        <p className="tile-delta text-muted numeric">
          {formatSigned(previousDelta)} since last reading
        </p>
      )}
    </div>
  );
}

function delta(current: number | null, baseline: number | null): number | null {
  if (current === null || baseline === null) return null;
  return current - baseline;
}

function emptyEntry(date: PlainDate): EntryInput {
  return {
    date,
    weight: null,
    bodyFat: null,
    vo2Max: null,
    systolic: null,
    diastolic: null,
    consumedCals: null,
    activeCals: null,
  };
}

function resolveDate(
  raw: string | string[] | undefined,
  today: PlainDate,
  start: PlainDate,
  end: PlainDate,
): PlainDate {
  const requested = typeof raw === "string" && isPlainDate(raw) ? raw : null;
  const candidate = requested ?? today;

  if (candidate < start) return start;
  if (candidate > end) return end;
  return candidate;
}
