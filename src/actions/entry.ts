"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/server";
import { getActivePlan, saveEntryFields, toPlanInput } from "@/lib/plans";
import { planTargets } from "@/lib/calc";
import { daysBetween, isPlainDate, type PlainDate } from "@/lib/date";
import {
  isEntryFieldName,
  parseEntryField,
  percentToFraction,
  type EntryFieldName,
} from "@/lib/validation";

export type SaveFieldResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Saves a single measurement for a single day.
 *
 * One field at a time is the whole point: weight lands at seven in the morning,
 * calories at ten at night, and blood pressure whenever the cuff comes out.
 * Each write touches only its own column, so a later save can never clobber an
 * earlier one, and there is no submit button to forget.
 */
export async function saveEntryFieldAction(input: {
  date: string;
  field: string;
  /** The raw input value. An empty string clears the measurement. */
  value: string;
}): Promise<SaveFieldResult> {
  await requireAuth();

  if (!isPlainDate(input.date)) {
    return { ok: false, error: "That isn't a valid date." };
  }
  if (!isEntryFieldName(input.field)) {
    return { ok: false, error: "Unknown measurement." };
  }

  const plan = await getActivePlan();
  if (!plan) {
    return { ok: false, error: "There's no active plan to log against." };
  }

  // Refuse dates outside the plan. Without this a mistyped URL would file an
  // entry that no screen in the app would ever show again.
  const planInput = toPlanInput(plan);
  const targets = planTargets(planInput);
  if (input.date < planInput.startDate || input.date > targets.endDate) {
    return { ok: false, error: "That date is outside this plan." };
  }

  const parsed = parseEntryField(input.field, input.value);
  if (!parsed.ok) return parsed;

  await saveEntryFields(plan.id, input.date as PlainDate, {
    [input.field]: storedValue(input.field, parsed.value),
  });

  // Today reads the same rows, so both screens have to refresh.
  revalidatePath("/log");
  revalidatePath("/today");
  revalidatePath("/progress");

  return { ok: true };
}

/** Body fat is entered as a percentage and stored as a fraction. */
function storedValue(field: EntryFieldName, value: number | null): number | null {
  return field === "bodyFat" ? percentToFraction(value) : value;
}

/**
 * How far a date sits from the plan's start, for the "Day 12 of 93" label.
 * Exported for the Log and Today screens, which both need it.
 */
export async function dayNumberFor(date: PlainDate): Promise<number | null> {
  const plan = await getActivePlan();
  if (!plan) return null;

  return daysBetween(toPlanInput(plan).startDate, date) + 1;
}
