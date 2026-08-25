import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActivePlan } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Progress · Weight Challenge",
};

export default async function ProgressPage() {
  const plan = await getActivePlan();
  if (!plan) redirect("/plan/new");

  return (
    <>
      <header style={{ marginBottom: "var(--space-xl)" }}>
        <p className="label-caps">{plan.name}</p>
        <h1 className="page-title">Progress</h1>
      </header>

      <div className="card">
        <p className="text-muted">Whole-plan progress lands here in a later phase: the deficit burndown, charts for weight, body fat, VO2 max and blood pressure, current-versus-best stats, and the progress photo timeline.</p>
      </div>
    </>
  );
}
