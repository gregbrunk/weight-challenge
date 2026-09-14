import type { Metadata } from "next";
import Link from "next/link";
import { PlanForm, type PlanFormValues } from "@/components/plan-form";
import { getActivePlan, getPlanById, planToFormValues } from "@/lib/plans";
import { getToday } from "@/lib/timezone-server";

export const metadata: Metadata = {
  title: "New plan · Weight Challenge",
};

/**
 * Sensible starting points, not prescriptions. The start date is filled in per
 * request from the visitor's own timezone rather than the server's.
 */
const DEFAULTS: Omit<PlanFormValues, "startDate"> = {
  name: "",
  days: "90",
  rmr: "",
  targetActiveCals: "",
  lbsToLose: "",
  calsPerLb: "3500",
  startWeight: "",
  startBodyFat: "",
  startVo2Max: "",
  startSystolic: "",
  startDiastolic: "",
};

/**
 * Also the restart screen: `?from=<planId>` prefills every field from that plan
 * with today as the start date, and brings its tasks along on submit. It is
 * the same form and the same create action — a restart is a new plan that
 * happens to begin where an old one did, so nothing is copied until "Start this
 * plan" is pressed and everything can be changed first.
 *
 * An unknown `from` falls back to a blank form rather than a 404: the link that
 * carried it is stale, not the page.
 */
export default async function NewPlanPage({ searchParams }: PageProps<"/plan/new">) {
  const { from } = await searchParams;
  const sourceId = typeof from === "string" ? from : undefined;

  const [existing, startDate, source] = await Promise.all([
    getActivePlan(),
    getToday(),
    sourceId ? getPlanById(sourceId) : Promise.resolve(null),
  ]);

  const restarting = source !== null;
  const defaults: PlanFormValues = restarting
    ? { ...planToFormValues(source), startDate }
    : { ...DEFAULTS, startDate };

  return (
    <>
      <header style={{ marginBottom: "var(--space-xl)" }}>
        <p className="label-caps">
          {restarting ? "Restart" : existing ? "New plan" : "Welcome"}
        </p>
        <h1 className="page-title">
          {restarting
            ? source.name
            : existing
              ? "Start a new plan"
              : "Set up your first plan"}
        </h1>
        <p className="page-subtitle">
          {restarting ? (
            <>
              Everything below is filled in from the earlier plan, with the start
              date moved to today. Change whatever you like — your starting weight
              has probably moved — then start it. Its daily tasks come along too,
              with fresh streaks.
              {existing && existing.id !== source.id && (
                <>
                  {" "}
                  Starting archives <strong>{existing.name}</strong>; nothing is
                  deleted.
                </>
              )}
            </>
          ) : existing ? (
            <>
              Starting a new plan archives <strong>{existing.name}</strong>. Nothing
              is deleted — you can make it current again from the archive.
            </>
          ) : (
            "Set your goal and your numbers. Everything else in the app is calculated from what you enter here, and you can change any of it later."
          )}
        </p>
      </header>

      <PlanForm
        mode="create"
        initialValues={defaults}
        sourcePlanId={restarting ? source.id : undefined}
      />

      {existing && (
        <p style={{ marginTop: "var(--space-lg)" }}>
          <Link
            href="/plan"
            className="text-muted"
            style={{ fontSize: "var(--text-body-md)" }}
          >
            ← Back to the current plan
          </Link>
        </p>
      )}
    </>
  );
}
