import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { activatePlanAction, archiveCurrentPlanAction } from "@/actions/plan";
import { getActivePlan, listArchivedPlans, toPlanInput } from "@/lib/plans";
import { planTargets } from "@/lib/calc";
import { formatLong } from "@/lib/date";
import { formatCalories, formatDays, formatWeight } from "@/lib/format";
import type { Plan } from "@/generated/prisma/client";

export const metadata: Metadata = {
  title: "Plan · Weight Challenge",
};

export default async function PlanPage() {
  const plan = await getActivePlan();
  if (!plan) redirect("/plan/new");

  const archived = await listArchivedPlans();
  const targets = planTargets(toPlanInput(plan));

  return (
    <>
      <header style={{ marginBottom: "var(--space-xl)" }}>
        <p className="label-caps">Current plan</p>
        <h1 className="page-title">{plan.name}</h1>
        <p className="page-subtitle">
          {formatLong(toPlanInput(plan).startDate)} – {formatLong(targets.endDate)} ·{" "}
          {formatDays(plan.days)}
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card" aria-labelledby="targets-heading">
          <h2 id="targets-heading" className="label-caps" style={{ marginBottom: "var(--space-md)" }}>
            Daily targets
          </h2>

          <Figure
            label="Food ceiling"
            value={formatCalories(targets.allowedFoodCals)}
            unit="cal"
          />
          <Figure
            label="Exercise floor"
            value={formatCalories(targets.targetActiveCals)}
            unit="cal"
          />
          <Figure
            label="Deficit needed"
            value={formatCalories(targets.necessaryDailyDeficit)}
            unit="cal"
            last
          />
        </section>

        <section className="card" aria-labelledby="goal-heading">
          <h2 id="goal-heading" className="label-caps" style={{ marginBottom: "var(--space-md)" }}>
            The goal
          </h2>

          <Figure label="To lose" value={formatWeight(plan.lbsToLose)} unit="lb" />
          <Figure
            label="Target weight"
            value={formatWeight(targets.targetWeight)}
            unit="lb"
          />
          <Figure
            label="Total deficit"
            value={formatCalories(targets.totalDeficitTarget)}
            unit="cal"
            last
          />
        </section>

        <section className="card md:col-span-2" aria-labelledby="inputs-heading">
          <h2 id="inputs-heading" className="label-caps" style={{ marginBottom: "var(--space-md)" }}>
            Your inputs
          </h2>

          <div className="grid gap-x-6 sm:grid-cols-2">
            <Figure label="RMR" value={formatCalories(plan.rmr)} unit="cal" />
            <Figure
              label="Exercise target"
              value={formatCalories(plan.targetActiveCals)}
              unit="cal"
            />
            <Figure
              label="Starting weight"
              value={formatWeight(plan.startWeight)}
              unit="lb"
            />
            <Figure
              label="Calories per pound"
              value={formatCalories(plan.calsPerLb)}
              unit="cal"
              last
            />
          </div>
        </section>
      </div>

      <div
        className="flex flex-col gap-3 sm:flex-row"
        style={{ marginTop: "var(--space-lg)" }}
      >
        <Link href={`/plan/${plan.id}/edit`} className="btn btn-secondary">
          Edit plan
        </Link>
        <Link href="/plan/new" className="btn btn-secondary">
          Start a new plan
        </Link>
        <form action={archiveCurrentPlanAction}>
          <button type="submit" className="btn btn-ghost">
            Archive this plan
          </button>
        </form>
      </div>

      <section aria-labelledby="archive-heading" style={{ marginTop: "var(--space-3xl)" }}>
        <h2 id="archive-heading" className="page-title" style={{ fontSize: "var(--text-h3)" }}>
          Archive
        </h2>
        <p className="page-subtitle" style={{ marginBottom: "var(--space-lg)" }}>
          Past attempts, with everything logged against them. Making one current
          again archives whatever is active.
        </p>

        {archived.length === 0 ? (
          <div className="card">
            <p className="text-muted">
              Nothing archived yet. Plans land here when you archive them or start
              a new one.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3" style={{ listStyle: "none", padding: 0 }}>
            {archived.map((archivedPlan) => (
              <ArchivedPlanRow key={archivedPlan.id} plan={archivedPlan} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function ArchivedPlanRow({ plan }: { plan: Plan }) {
  const input = toPlanInput(plan);
  const targets = planTargets(input);

  return (
    <li className="card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3
            style={{
              fontSize: "var(--text-h4)",
              fontWeight: "var(--weight-bold)",
              lineHeight: "var(--leading-snug)",
            }}
          >
            {plan.name}
          </h3>
          <p className="text-muted" style={{ fontSize: "var(--text-body-sm)" }}>
            {formatLong(input.startDate)} – {formatLong(targets.endDate)} ·{" "}
            {formatDays(plan.days)} · goal {formatWeight(plan.lbsToLose)} lb
          </p>
        </div>

        <form action={activatePlanAction}>
          <input type="hidden" name="id" value={plan.id} />
          <button type="submit" className="btn btn-secondary btn-sm">
            Make current
          </button>
        </form>
      </div>
    </li>
  );
}

function Figure({
  label,
  value,
  unit,
  last = false,
}: {
  label: string;
  value: string;
  unit?: string;
  last?: boolean;
}) {
  return (
    <div
      className="flex items-baseline justify-between gap-3"
      style={{ marginBottom: last ? 0 : "var(--space-sm)" }}
    >
      <span className="text-muted" style={{ fontSize: "var(--text-body-sm)" }}>
        {label}
      </span>
      <span
        className="numeric"
        style={{ fontWeight: "var(--weight-medium)", whiteSpace: "nowrap" }}
      >
        {value}
        {unit && value !== "—" && (
          <span
            className="text-muted"
            style={{ fontSize: "var(--text-body-sm)", marginLeft: "var(--space-2xs)" }}
          >
            {unit}
          </span>
        )}
      </span>
    </div>
  );
}
