"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/server";
import {
  activatePlan,
  archivePlan,
  createPlan,
  getActivePlan,
  updatePlan,
  type PlanFields,
} from "@/lib/plans";
import {
  fieldErrors,
  percentToFraction,
  planFieldsSchema,
} from "@/lib/validation";
import type { PlainDate } from "@/lib/date";
import type { PlanFormState } from "./plan-state";


function parse(formData: FormData) {
  return planFieldsSchema.safeParse({
    name: formData.get("name"),
    startDate: formData.get("startDate"),
    days: formData.get("days"),
    rmr: formData.get("rmr"),
    targetActiveCals: formData.get("targetActiveCals"),
    lbsToLose: formData.get("lbsToLose"),
    calsPerLb: formData.get("calsPerLb"),
    startWeight: formData.get("startWeight"),
    startBodyFat: formData.get("startBodyFat"),
    startVo2Max: formData.get("startVo2Max"),
    startSystolic: formData.get("startSystolic"),
    startDiastolic: formData.get("startDiastolic"),
  });
}

function toFields(parsed: ReturnType<typeof parse> & { success: true }): PlanFields {
  const data = parsed.data;

  return {
    name: data.name,
    startDate: data.startDate as PlainDate,
    days: data.days,
    rmr: data.rmr,
    targetActiveCals: data.targetActiveCals,
    lbsToLose: data.lbsToLose,
    calsPerLb: data.calsPerLb,
    startWeight: data.startWeight,
    // The form collects a percentage; the database holds a fraction.
    startBodyFat: percentToFraction(data.startBodyFat),
    startVo2Max: data.startVo2Max,
    startSystolic: data.startSystolic,
    startDiastolic: data.startDiastolic,
  };
}

export async function createPlanAction(
  _previous: PlanFormState,
  formData: FormData,
): Promise<PlanFormState> {
  await requireAuth();

  const parsed = parse(formData);
  if (!parsed.success) {
    return { errors: fieldErrors(parsed.error), message: "Check the fields below." };
  }

  await createPlan(toFields(parsed));

  revalidatePath("/", "layout");
  redirect("/today");
}

export async function updatePlanAction(
  _previous: PlanFormState,
  formData: FormData,
): Promise<PlanFormState> {
  await requireAuth();

  const id = String(formData.get("id") ?? "");
  if (!id) return { errors: {}, message: "That plan no longer exists." };

  const parsed = parse(formData);
  if (!parsed.success) {
    return { errors: fieldErrors(parsed.error), message: "Check the fields below." };
  }

  await updatePlan(id, toFields(parsed));

  revalidatePath("/", "layout");
  redirect("/plan");
}

export async function archivePlanAction(formData: FormData): Promise<void> {
  await requireAuth();

  const id = String(formData.get("id") ?? "");
  if (id) await archivePlan(id);

  revalidatePath("/", "layout");
  redirect("/plan");
}

export async function activatePlanAction(formData: FormData): Promise<void> {
  await requireAuth();

  const id = String(formData.get("id") ?? "");
  if (id) await activatePlan(id);

  revalidatePath("/", "layout");
  redirect("/plan");
}

/**
 * Convenience for the archive screen: archiving the current plan leaves the app
 * with no active plan, which routes back to setup.
 */
export async function archiveCurrentPlanAction(): Promise<void> {
  await requireAuth();

  const plan = await getActivePlan();
  if (plan) await archivePlan(plan.id);

  revalidatePath("/", "layout");
  redirect("/plan/new");
}
