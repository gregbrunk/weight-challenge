import type { Metadata } from "next";
import Link from "next/link";
import { PlanForm, type PlanFormValues } from "@/components/plan-form";
import { getActivePlan } from "@/lib/plans";
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

export default async function NewPlanPage() {
  const [existing, startDate] = await Promise.all([getActivePlan(), getToday()]);
  const defaults: PlanFormValues = { ...DEFAULTS, startDate };

  return (
    <>
      <header style={{ marginBottom: "var(--space-xl)" }}>
        <p className="label-caps">{existing ? "New plan" : "Welcome"}</p>
        <h1 className="page-title">
          {existing ? "Start a new plan" : "Set up your first plan"}
        </h1>
        <p className="page-subtitle">
          {existing ? (
            <>
              Starting a new plan archives <strong>{existing.name}</strong>. Nothing
              is deleted — you can make it current again from the archive.
            </>
          ) : (
            "Set your goal and your numbers. Everything else in the app is calculated from what you enter here, and you can change any of it later."
          )}
        </p>
      </header>

      <PlanForm mode="create" initialValues={defaults} />

      {existing && (
        <p style={{ marginTop: "var(--space-lg)" }}>
          <Link
            href="/plan"
            className="text-muted"
            style={{ fontSize: "var(--text-body-sm)" }}
          >
            ← Back to the current plan
          </Link>
        </p>
      )}
    </>
  );
}
