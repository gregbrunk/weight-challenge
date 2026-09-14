import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlanForm } from "@/components/plan-form";
import { getPlanById, planToFormValues } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Edit plan · Weight Challenge",
};

export default async function EditPlanPage({ params }: PageProps<"/plan/[id]/edit">) {
  const { id } = await params;
  const plan = await getPlanById(id);
  if (!plan) notFound();

  const values = planToFormValues(plan);

  return (
    <>
      <header style={{ marginBottom: "var(--space-xl)" }}>
        <p className="label-caps">Editing</p>
        <h1 className="page-title">{plan.name}</h1>
        <p className="page-subtitle">
          Changing the goal, the length or your baseline recalculates every target
          and every progress figure. Nothing you&apos;ve logged is affected.
        </p>
      </header>

      <PlanForm mode="edit" planId={plan.id} initialValues={values} />
    </>
  );
}
