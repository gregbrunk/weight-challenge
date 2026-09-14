/**
 * Plan and entry data access.
 *
 * Everything the database returns is translated at this boundary into the plain
 * shapes the calc layer understands, so nothing downstream deals with Prisma
 * types or `Date` objects. That keeps the math testable and stops timezone
 * handling from leaking into screens.
 */

// Importing this from a client component is a build error, not a runtime
// one — which is the point. Three separate bugs in this project were a
// client component pulling a server module in through a shared constant.
import "server-only";

import type { DailyEntry, Plan } from "@/generated/prisma/client";
import type { PlanFormValues } from "@/components/plan-form";
import { prisma } from "./db";
import type { EntryInput, PlanInput } from "./calc";
import type { PlainDate } from "./date";
import { numberToInputValue } from "./format";
import { fractionToPercent } from "./validation";

// ---------------------------------------------------------------------------
// Date translation
// ---------------------------------------------------------------------------

/**
 * Postgres `date` columns come back as a `Date` at UTC midnight. Read the UTC
 * components — never the local ones, which would shift the day backwards for
 * anyone west of Greenwich.
 */
export function fromDbDate(value: Date): PlainDate {
  return [
    String(value.getUTCFullYear()).padStart(4, "0"),
    String(value.getUTCMonth() + 1).padStart(2, "0"),
    String(value.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function toDbDate(value: PlainDate): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

// ---------------------------------------------------------------------------
// Translation to calc shapes
// ---------------------------------------------------------------------------

export function toPlanInput(plan: Plan): PlanInput {
  return {
    startDate: fromDbDate(plan.startDate),
    days: plan.days,
    rmr: plan.rmr,
    targetActiveCals: plan.targetActiveCals,
    lbsToLose: plan.lbsToLose,
    calsPerLb: plan.calsPerLb,
    startWeight: plan.startWeight,
    startBodyFat: plan.startBodyFat,
    startVo2Max: plan.startVo2Max,
    startSystolic: plan.startSystolic,
    startDiastolic: plan.startDiastolic,
  };
}

export function toEntryInput(entry: DailyEntry): EntryInput {
  return {
    date: fromDbDate(entry.date),
    weight: entry.weight,
    bodyFat: entry.bodyFat,
    vo2Max: entry.vo2Max,
    systolic: entry.systolic,
    diastolic: entry.diastolic,
    consumedCals: entry.consumedCals,
    activeCals: entry.activeCals,
  };
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export async function getActivePlan(): Promise<Plan | null> {
  return prisma.plan.findFirst({
    where: { status: "active" },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPlanById(id: string): Promise<Plan | null> {
  return prisma.plan.findUnique({ where: { id } });
}

export async function listPlans(): Promise<Plan[]> {
  return prisma.plan.findMany({
    orderBy: [{ status: "asc" }, { startDate: "desc" }],
  });
}

export async function listArchivedPlans(): Promise<Plan[]> {
  return prisma.plan.findMany({
    where: { status: "archived" },
    orderBy: { startDate: "desc" },
  });
}

export interface PlanFields {
  name: string;
  startDate: PlainDate;
  days: number;
  rmr: number;
  targetActiveCals: number;
  lbsToLose: number;
  calsPerLb: number;
  startWeight: number | null;
  startBodyFat: number | null;
  startVo2Max: number | null;
  startSystolic: number | null;
  startDiastolic: number | null;
}

function toDbFields(fields: PlanFields) {
  return { ...fields, startDate: toDbDate(fields.startDate) };
}

/**
 * Creates a plan and makes it the current one, archiving whatever was active.
 *
 * Done in a transaction: two active plans at once would make "the current plan"
 * ambiguous everywhere in the app.
 */
/**
 * Creates a plan and makes it current.
 *
 * `copyTasksFrom` restarts a plan: the new one begins with the same habit list
 * as the source, as fresh rows with no completions. That keeps the rule that a
 * streak describes one attempt — nothing here carries history across plans,
 * only the intention to do the same things again. Their start date is the new
 * plan's first day, because tasks are the plan's rules and run from day one.
 *
 * All of it happens in one transaction, so a plan can never exist half-set-up
 * with some of its tasks and not others.
 */
export async function createPlan(
  fields: PlanFields,
  options: { copyTasksFrom?: string } = {},
): Promise<Plan> {
  return prisma.$transaction(async (tx) => {
    await tx.plan.updateMany({
      where: { status: "active" },
      data: { status: "archived", archivedAt: new Date() },
    });

    const plan = await tx.plan.create({
      data: { ...toDbFields(fields), status: "active" },
    });

    if (options.copyTasksFrom) {
      const source = await tx.task.findMany({
        where: { planId: options.copyTasksFrom },
        orderBy: { position: "asc" },
      });

      if (source.length > 0) {
        await tx.task.createMany({
          data: source.map((task) => ({
            planId: plan.id,
            name: task.name,
            position: task.position,
            autoRule: task.autoRule,
            startDate: toDbDate(fields.startDate),
          })),
        });
      }
    }

    return plan;
  });
}

/**
 * A stored plan as the strings the form edits.
 *
 * Used by Edit, and by Restart — which is Edit's mapping with today's date
 * swapped in and a create rather than an update on submit. Body fat is stored
 * as a fraction and edited as a percentage; everything else is a number that
 * becomes text so a half-typed value never turns into NaN mid-edit.
 */
export function planToFormValues(plan: Plan): PlanFormValues {
  const input = toPlanInput(plan);

  return {
    name: plan.name,
    startDate: input.startDate,
    days: String(plan.days),
    rmr: String(plan.rmr),
    targetActiveCals: String(plan.targetActiveCals),
    lbsToLose: numberToInputValue(plan.lbsToLose),
    calsPerLb: String(plan.calsPerLb),
    startWeight: numberToInputValue(plan.startWeight),
    startBodyFat: numberToInputValue(fractionToPercent(plan.startBodyFat)),
    startVo2Max: numberToInputValue(plan.startVo2Max),
    startSystolic: numberToInputValue(plan.startSystolic),
    startDiastolic: numberToInputValue(plan.startDiastolic),
  };
}

export async function updatePlan(id: string, fields: PlanFields): Promise<Plan> {
  return prisma.plan.update({ where: { id }, data: toDbFields(fields) });
}

export async function archivePlan(id: string): Promise<Plan> {
  return prisma.plan.update({
    where: { id },
    data: { status: "archived", archivedAt: new Date() },
  });
}

/** Makes an archived plan current again, archiving whatever was active. */
export async function activatePlan(id: string): Promise<Plan> {
  return prisma.$transaction(async (tx) => {
    await tx.plan.updateMany({
      where: { status: "active", NOT: { id } },
      data: { status: "archived", archivedAt: new Date() },
    });

    return tx.plan.update({
      where: { id },
      data: { status: "active", archivedAt: null },
    });
  });
}

export async function deletePlan(id: string): Promise<void> {
  // Entries and photos cascade; blob objects are cleaned up by the caller.
  await prisma.plan.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

export async function getEntries(planId: string): Promise<DailyEntry[]> {
  return prisma.dailyEntry.findMany({
    where: { planId },
    orderBy: { date: "asc" },
  });
}

export async function getEntryInputs(planId: string): Promise<EntryInput[]> {
  return (await getEntries(planId)).map(toEntryInput);
}

export async function getEntry(
  planId: string,
  date: PlainDate,
): Promise<DailyEntry | null> {
  return prisma.dailyEntry.findUnique({
    where: { planId_date: { planId, date: toDbDate(date) } },
  });
}

/** The measurements a day can hold. Undefined means "leave alone". */
export type EntryFields = Partial<{
  weight: number | null;
  bodyFat: number | null;
  vo2Max: number | null;
  systolic: number | null;
  diastolic: number | null;
  consumedCals: number | null;
  activeCals: number | null;
  note: string | null;
}>;

/**
 * Writes one or more fields for a day, creating the row if it's the first thing
 * logged. Fields left undefined are untouched, which is what lets the morning's
 * weigh-in survive the evening's calorie entry.
 */
export async function saveEntryFields(
  planId: string,
  date: PlainDate,
  fields: EntryFields,
): Promise<DailyEntry> {
  const dbDate = toDbDate(date);

  return prisma.dailyEntry.upsert({
    where: { planId_date: { planId, date: dbDate } },
    create: { planId, date: dbDate, ...fields },
    update: fields,
  });
}
