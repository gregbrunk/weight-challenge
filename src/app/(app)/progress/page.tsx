import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MetricChart } from "@/components/metric-chart";
import { PhotoTimeline, type TimelineDay } from "@/components/photo-timeline";
import { StreakCard, type StreakCardTask } from "@/components/streak-card";
import { getTaskContext, toTaskInput } from "@/lib/tasks";
import { AUTO_RULE_LABELS, computeTaskStats, taskCalendar } from "@/lib/streaks";
import { planProgress, type MetricProgress } from "@/lib/calc";
import { buildChartRows, hasData } from "@/lib/chart-data";
import { daysBetween, formatLong } from "@/lib/date";
import {
  EM_DASH,
  formatCalories,
  formatDays,
  formatPercent,
  formatSigned,
  formatSignedCalories,
  formatWeight,
} from "@/lib/format";
import { getPhotosForPlan } from "@/lib/photos";
import { getActivePlan, getEntryInputs, toPlanInput } from "@/lib/plans";
import { getToday } from "@/lib/timezone-server";

export const metadata: Metadata = {
  title: "Progress · Weight Challenge",
};

export default async function ProgressPage() {
  const plan = await getActivePlan();
  if (!plan) redirect("/plan/new");

  const planInput = toPlanInput(plan);
  const today = await getToday();

  const [entries, photos, taskContext] = await Promise.all([
    getEntryInputs(plan.id),
    getPhotosForPlan(plan.id),
    getTaskContext(plan.id),
  ]);

  const streakTasks: StreakCardTask[] = taskContext.tasks.map((task) => {
    const input = toTaskInput(task);
    const completions = taskContext.completionsByTask.get(task.id) ?? new Set<string>();

    return {
      id: task.id,
      name: task.name,
      autoNote:
        input.autoRule === "manual" ? null : AUTO_RULE_LABELS[input.autoRule],
      stats: computeTaskStats(
        input,
        planInput,
        completions,
        taskContext.entriesByDate,
        today,
      ),
      calendar: taskCalendar(
        input,
        planInput,
        completions,
        taskContext.entriesByDate,
        today,
      ),
    };
  });

  const progress = planProgress(planInput, entries, today);
  const rows = buildChartRows(planInput, entries, today);
  const { targets } = progress;

  return (
    <>
      <header style={{ marginBottom: "var(--space-lg)" }}>
        <p className="label-caps">{plan.name}</p>
        <h1 className="page-title">Progress</h1>
        <p className="page-subtitle">
          Day {progress.dayNumber} of {plan.days} · {formatDays(progress.daysRemaining)}{" "}
          left · ends {formatLong(targets.endDate)}
        </p>
      </header>

      <div className="flex flex-col" style={{ gap: "var(--space-md)" }}>
        {/* ---- Burndown: the headline number ---- */}
        <section className="card" aria-labelledby="burndown-heading">
          <div className="flex items-start justify-between gap-3">
            <h2 id="burndown-heading" className="label-caps">
              Deficit banked
            </h2>
            <span
              className={`badge ${progress.cumulativeToPlan >= 0 ? "badge-success" : "badge-danger"}`}
            >
              <span aria-hidden="true">
                {progress.cumulativeToPlan >= 0 ? "▲" : "▼"}
              </span>
              {formatSignedCalories(progress.cumulativeToPlan)} to plan
            </span>
          </div>

          <p className="hero-value numeric" style={{ marginBlock: "var(--space-xs)" }}>
            {formatCalories(progress.deficitBanked)}
          </p>
          <p className="text-muted">
            of {formatCalories(targets.totalDeficitTarget)} cal —{" "}
            {formatPercent(progress.deficitProgress)} of the way there
          </p>

          <div
            className="burndown-bar"
            role="meter"
            aria-valuenow={Math.round(progress.deficitBanked)}
            aria-valuemin={0}
            aria-valuemax={Math.round(targets.totalDeficitTarget)}
            aria-label={`Deficit banked: ${Math.round(progress.deficitBanked)} of ${Math.round(targets.totalDeficitTarget)} calories`}
          >
            <div
              className="burndown-fill"
              style={{
                width: `${Math.min(100, Math.max(0, progress.deficitProgress * 100))}%`,
              }}
            />
          </div>

          <p className="text-muted" style={{ fontSize: "var(--text-body-md)" }}>
            {formatCalories(Math.max(0, progress.deficitRemaining))} cal still to burn
            {progress.requiredDailyDeficitFromHere !== null && (
              <>
                {" "}
                —{" "}
                <span className="numeric">
                  {formatCalories(progress.requiredDailyDeficitFromHere)}
                </span>{" "}
                a day from here
              </>
            )}
          </p>
        </section>

        {/* ---- Pace ---- */}
        <section className="card" aria-labelledby="pace-heading">
          <h2 id="pace-heading" className="label-caps" style={{ marginBottom: "var(--space-md)" }}>
            Pace
          </h2>

          <div className="stat-grid">
            <Figure
              label="Average daily deficit"
              value={formatCalories(progress.averageDailyDeficit)}
              unit="cal"
              note={`over ${formatDays(progress.daysLogged)} logged`}
            />
            <Figure
              label="Projected end weight"
              value={formatWeight(progress.projectedEndWeight)}
              unit="lb"
              note={
                targets.targetWeight === null
                  ? "no starting weight set"
                  : `target ${formatWeight(targets.targetWeight)}`
              }
            />
            <Figure
              label="Lost by the scale"
              value={formatSigned(progress.lbsLostByScale)}
              unit="lb"
              note={`${formatWeight(progress.lbsLostByDeficit)} lb by calories`}
            />
          </div>

          {progress.daysLogged === 0 && (
            <p className="text-muted" style={{ fontSize: "var(--text-body-md)", marginTop: "var(--space-md)" }}>
              Nothing logged yet, so there&apos;s no pace to project from.{" "}
              <Link href="/log">Start logging</Link>.
            </p>
          )}
        </section>

        {/* ---- Current versus best ---- */}
        <section aria-labelledby="best-heading">
          <h2 id="best-heading" className="label-caps" style={{ marginBottom: "var(--space-md)" }}>
            Current versus best
          </h2>

          <div className="stat-grid">
            <StatCard
              label="Pounds lost"
              metric={progress.weight}
              format={(value) => formatSigned(value)}
              unit="lb"
            />
            <StatCard
              label="Body fat lost"
              metric={progress.bodyFat}
              format={(value) => formatSigned(value * 100)}
              unit="pts"
            />
            <StatCard
              label="VO2 max gained"
              metric={progress.vo2Max}
              format={(value) => formatSigned(value)}
            />
            <StatCard
              label="Systolic improvement"
              metric={progress.systolic}
              format={(value) => formatSigned(value, 0)}
            />
            <StatCard
              label="Diastolic improvement"
              metric={progress.diastolic}
              format={(value) => formatSigned(value, 0)}
            />
          </div>
        </section>

        {/* ---- Streaks ---- */}
        <section aria-labelledby="streaks-heading">
          <h2 id="streaks-heading" className="label-caps" style={{ marginBottom: "var(--space-md)" }}>
            Daily tasks
          </h2>

          {streakTasks.length === 0 ? (
            <div className="card">
              <p className="text-muted" style={{ marginBottom: "var(--space-md)" }}>
                No daily tasks yet. Set up the things you need to do each day and
                their streaks and records will collect here.
              </p>
              <Link href="/plan" className="btn btn-secondary btn-sm">
                Set up tasks
              </Link>
            </div>
          ) : (
            <div className="flex flex-col" style={{ gap: "var(--space-md)" }}>
              {streakTasks.map((task) => (
                <StreakCard key={task.id} task={task} />
              ))}
            </div>
          )}
        </section>

        {/* ---- Charts ---- */}
        <section aria-labelledby="charts-heading">
          <h2 id="charts-heading" className="label-caps" style={{ marginBottom: "var(--space-md)" }}>
            Over time
          </h2>

          <div className="flex flex-col" style={{ gap: "var(--space-md)" }}>
            {hasData(rows, "weight") ? (
              <MetricChart
                title="Weight"
                description="Against the pace that finishes on target."
                rows={rows}
                unit=" lb"
                minSpan={4}
                series={[
                  { key: "weightGoal", label: "On pace", className: "series-goal", reference: true },
                  { key: "weight", label: "Weight", className: "series-weight" },
                ]}
              />
            ) : (
              <EmptyChart title="Weight" />
            )}

            {hasData(rows, "bodyFat") ? (
              <MetricChart
                title="Body fat"
                rows={rows}
                unit="%"
                minSpan={2}
                series={[{ key: "bodyFat", label: "Body fat", className: "series-bodyfat" }]}
              />
            ) : (
              <EmptyChart title="Body fat" />
            )}

            {hasData(rows, "vo2Max") ? (
              <MetricChart
                title="VO2 max"
                description="Higher is better."
                rows={rows}
                minSpan={2}
                series={[{ key: "vo2Max", label: "VO2 max", className: "series-vo2" }]}
              />
            ) : (
              <EmptyChart title="VO2 max" />
            )}

            {hasData(rows, "systolic") || hasData(rows, "diastolic") ? (
              <MetricChart
                title="Blood pressure"
                description="Lower is better."
                rows={rows}
                decimals={0}
                minSpan={10}
                series={[
                  { key: "systolic", label: "Systolic", className: "series-systolic" },
                  { key: "diastolic", label: "Diastolic", className: "series-diastolic" },
                ]}
              />
            ) : (
              <EmptyChart title="Blood pressure" />
            )}
          </div>
        </section>

        {/* ---- Photo timeline ---- */}
        <section aria-labelledby="photos-heading">
          <h2 id="photos-heading" className="label-caps" style={{ marginBottom: "var(--space-md)" }}>
            Photo timeline
          </h2>

          {photos.length === 0 ? (
            <div className="card">
              <p className="text-muted" style={{ marginBottom: "var(--space-md)" }}>
                Progress photos you add on the Log screen collect here, so you can
                scroll back through the plan and compare.
              </p>
              <Link href="/log" className="btn btn-secondary btn-sm">
                Go to the log
              </Link>
            </div>
          ) : (
            <>
              <p className="page-subtitle" style={{ marginBottom: "var(--space-md)" }}>
                {photos.length} photo{photos.length === 1 ? "" : "s"} across{" "}
                {groupByDate(photos, planInput.startDate).length} day
                {groupByDate(photos, planInput.startDate).length === 1 ? "" : "s"}. Scroll
                sideways, tap any photo to open it.
              </p>
              <PhotoTimeline days={groupByDate(photos, planInput.startDate)} />
            </>
          )}
        </section>
      </div>
    </>
  );
}

function groupByDate(
  photos: Awaited<ReturnType<typeof getPhotosForPlan>>,
  startDate: string,
): TimelineDay[] {
  const byDate = new Map<string, TimelineDay>();

  for (const photo of photos) {
    const existing = byDate.get(photo.date);
    if (existing) {
      existing.photos.push(photo);
    } else {
      byDate.set(photo.date, {
        date: photo.date,
        dayNumber: daysBetween(startDate, photo.date) + 1,
        photos: [photo],
      });
    }
  }

  return [...byDate.values()];
}

/**
 * Where a metric stands now, beside the best it has ever been.
 *
 * The gap between the two is the point of this card. The spreadsheet reported
 * both but in separate blocks; side by side, drift from a personal best is
 * visible without arithmetic.
 */
function StatCard({
  label,
  metric,
  format,
  unit,
}: {
  label: string;
  metric: MetricProgress;
  format: (value: number) => string;
  unit?: string;
}) {
  const empty = metric.current === null;

  return (
    <div className="card">
      <p className="label-caps">{label}</p>

      {empty ? (
        <p className="stat-pair">
          <span className="stat-current numeric text-muted">{EM_DASH}</span>
        </p>
      ) : (
        <>
          <p className="stat-pair">
            <span
              className={`stat-current numeric ${
                metric.current! > 0 ? "text-success" : metric.current! < 0 ? "text-danger" : ""
              }`}
            >
              {format(metric.current!)}
              {unit && (
                <span className="stat-best" style={{ marginLeft: "var(--space-2xs)" }}>
                  {unit}
                </span>
              )}
            </span>
            <span className="stat-best numeric">
              best {format(metric.max ?? 0)}
            </span>
          </p>

          {metric.offBest !== null && metric.offBest > 0 && (
            <p className="stat-offbest numeric">
              {format(metric.offBest)} off your best
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  unit,
  note,
}: {
  label: string;
  value: string;
  unit?: string;
  note?: string;
}) {
  return (
    <div className="card">
      <p className="label-caps">{label}</p>
      <p className="stat-current numeric" style={{ marginTop: "var(--space-2xs)" }}>
        {value}
        {unit && value !== EM_DASH && (
          <span className="stat-best" style={{ marginLeft: "var(--space-2xs)" }}>
            {unit}
          </span>
        )}
      </p>
      {note && <p className="stat-best">{note}</p>}
    </div>
  );
}

function EmptyChart({ title }: { title: string }) {
  return (
    <section className="card">
      <h3 className="chart-title">{title}</h3>
      <p className="text-muted" style={{ fontSize: "var(--text-body-md)", marginTop: "var(--space-2xs)" }}>
        Nothing logged yet. This chart appears once you record a reading.
      </p>
    </section>
  );
}
