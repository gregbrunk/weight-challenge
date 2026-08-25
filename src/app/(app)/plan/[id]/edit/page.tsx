import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlanForm, type PlanFormValues } from "@/components/plan-form";
import { getPlanById, toPlanInput } from "@/lib/plans";
import { fractionToPercent } from "@/lib/validation";
import { numberToInputValue } from "@/lib/format";

export const metadata: Metadata = {
  title: "Edit plan · Weight Challenge",
};

export default async function EditPlanPage({ params }: PageProps<"/plan/[id]/edit">) {
  const { id } = await params;
  const plan = await getPlanById(id);
  if (!plan) notFound();

  const input = toPlanInput(plan);

  const values: PlanFormValues = {
    name: plan.name,
    startDate: input.startDate,
    days: String(plan.days),
    rmr: String(plan.rmr),
    targetActiveCals: String(plan.targetActiveCals),
    lbsToLose: numberToInputValue(plan.lbsToLose),
    calsPerLb: String(plan.calsPerLb),
    startWeight: numberToInputValue(plan.startWeight),
    // Stored as a fraction, edited as a percentage.
    startBodyFat: numberToInputValue(fractionToPercent(plan.startBodyFat)),
    startVo2Max: numberToInputValue(plan.startVo2Max),
    startSystolic: numberToInputValue(plan.startSystolic),
    startDiastolic: numberToInputValue(plan.startDiastolic),
  };

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
