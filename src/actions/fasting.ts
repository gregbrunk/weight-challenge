"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/server";
import { planTargets } from "@/lib/calc";
import { addDays, isPlainDate, type PlainDate } from "@/lib/date";
import { hoursBetween } from "@/lib/fasting";
import {
  getActivePlan,
  getEntry,
  savePreStartFast,
  saveEntryFields,
  toPlanInput,
} from "@/lib/plans";
import { getTimeZone } from "@/lib/timezone-server";
import {
  instantFromZonedTime,
  parseTimeInput,
  toTimeInputValue,
  zonedDateOf,
} from "@/lib/timezone";

/**
 * On success, `value` is the wall-clock time actually stored, as "HH:MM" — or
 * "" when the time was cleared. The caller needs it because "now" is resolved
 * here rather than in the browser, so the field cannot know what it holds.
 */
export type SaveFastResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

/**
 * Which end of a fast a value belongs to.
 *
 * `preStart` is the odd one: the last meal the evening *before* the plan began.
 * It is the start that day one's fast needs, and the only one with no day of
 * its own to live on, so it is stored on the plan instead of in an entry.
 */
export type FastEdge = "start" | "end" | "preStart";

/**
 * The longest fast this will record.
 *
 * Not a medical opinion — a limit that catches the realistic data-entry error,
 * which is an end time typed against the wrong day. Two days is far past any
 * schedule on offer and still leaves room for a genuinely long one.
 */
const MAX_FAST_HOURS = 48;

/**
 * Records when you last ate, or when you first ate.
 *
 * Both ordinary edges are stored against the day they happened on: the start on
 * the evening it began, the end on the morning it finished. Pairing them into
 * one fast is `fastForDay`'s job, not this one's — here the only question is
 * whether the time you typed is a time that could have happened.
 *
 * `value` is a wall-clock "HH:MM" in the app's timezone, "" to clear the time,
 * or "now" to take the current one. "now" is resolved on the server rather than
 * sent by the browser, so a phone with a wrong clock can't file a fast an hour
 * out — and it is refused unless the day being edited really is today.
 */
export async function saveFastTimeAction(input: {
  date: string;
  edge: FastEdge;
  value: string;
}): Promise<SaveFastResult> {
  await requireAuth();

  if (!isPlainDate(input.date)) {
    return { ok: false, error: "That isn't a valid date." };
  }
  if (input.edge !== "start" && input.edge !== "end" && input.edge !== "preStart") {
    return { ok: false, error: "Unknown fast time." };
  }

  const plan = await getActivePlan();
  if (!plan) return { ok: false, error: "There's no active plan to log against." };

  const planInput = toPlanInput(plan);
  if (planInput.fastingPlan === null) {
    return { ok: false, error: "This plan isn't tracking intermittent fasting." };
  }

  const date = input.date as PlainDate;
  const targets = planTargets(planInput);
  if (date < planInput.startDate || date > targets.endDate) {
    return { ok: false, error: "That date is outside this plan." };
  }

  // The pre-plan evening is only ever edited from day one's screen, which is
  // the one day it means anything on.
  if (input.edge === "preStart" && date !== planInput.startDate) {
    return { ok: false, error: "That time belongs to the plan's first day." };
  }

  // The calendar day the time is a wall-clock reading *on*. For the pre-plan
  // evening that is the day before the plan, which has no entry of its own.
  const timeOfDay: PlainDate =
    input.edge === "preStart" ? addDays(planInput.startDate, -1) : date;

  const timeZone = await getTimeZone();

  // Clearing is always allowed: a time logged by mistake has to be removable,
  // and an orphaned half-fast simply stops being counted.
  if (input.value.trim() === "") {
    await write(plan.id, input.edge, date, null);
    revalidateFasting();
    return { ok: true, value: "" };
  }

  let instant: Date;
  if (input.value === "now") {
    instant = new Date();
    if (zonedDateOf(instant, timeZone) !== timeOfDay) {
      return { ok: false, error: "It isn't that day any more — type the time instead." };
    }
  } else {
    const minutes = parseTimeInput(input.value);
    if (minutes === null) return { ok: false, error: "Enter a time like 6:30 PM." };
    instant = instantFromZonedTime(timeOfDay, minutes, timeZone);
  }

  const problem =
    input.edge === "end"
      ? await checkEnd(plan.id, planInput.startDate, planInput.preStartFastAt, date, instant)
      : // A start pairs with the end logged on the following day — which for the
        // pre-plan evening is day one itself.
        await checkStart(
          plan.id,
          input.edge === "preStart" ? planInput.startDate : addDays(date, 1),
          instant,
        );
  if (problem) return { ok: false, error: problem };

  await write(plan.id, input.edge, date, instant);
  revalidateFasting();
  return { ok: true, value: toTimeInputValue(instant, timeZone) };
}

/** Each edge to its home: two columns on the day, one column on the plan. */
async function write(
  planId: string,
  edge: FastEdge,
  date: PlainDate,
  instant: Date | null,
): Promise<void> {
  if (edge === "preStart") {
    await savePreStartFast(planId, instant);
    return;
  }

  const column = edge === "start" ? "fastStartAt" : "fastEndAt";
  await saveEntryFields(planId, date, { [column]: instant });
}

/**
 * An end time is only meaningful against the start it closes.
 *
 * Without that start there is nothing to measure from, which is why the Log
 * screen greys the field out — this is the same rule enforced where it counts,
 * for the case where the page is stale or the start was just cleared. On day
 * one the start is the plan's pre-plan evening rather than a previous row.
 */
async function checkEnd(
  planId: string,
  planStart: PlainDate,
  preStartFastAt: Date | null,
  date: PlainDate,
  instant: Date,
): Promise<string | null> {
  const startAt =
    date === planStart
      ? preStartFastAt
      : ((await getEntry(planId, addDays(date, -1)))?.fastStartAt ?? null);

  if (startAt === null) {
    return date === planStart
      ? "Nothing was logged for the evening before the plan started, so there's nothing to end."
      : "No fast was started the day before, so there's nothing to end.";
  }
  if (instant <= startAt) {
    return "That's before the fast started — check the time.";
  }
  if (hoursBetween(startAt, instant) > MAX_FAST_HOURS) {
    return `That would be a fast of over ${MAX_FAST_HOURS} hours — check the time.`;
  }

  return null;
}

/**
 * A start has no partner yet unless the end it pairs with is already logged,
 * which happens when an earlier mistake is being corrected. When it is, the
 * pair still has to make sense in the same direction.
 */
async function checkStart(
  planId: string,
  pairedEndDate: PlainDate,
  instant: Date,
): Promise<string | null> {
  const endAt = (await getEntry(planId, pairedEndDate))?.fastEndAt ?? null;
  if (endAt === null) return null;

  if (endAt <= instant) {
    return "That's after the fast was ended the next day — check the time.";
  }
  if (hoursBetween(instant, endAt) > MAX_FAST_HOURS) {
    return `That would be a fast of over ${MAX_FAST_HOURS} hours — check the time.`;
  }

  return null;
}

function revalidateFasting(): void {
  // A fast shows on three screens, and the day it is credited to is not the day
  // it was typed on — so there is no narrower invalidation to make here.
  revalidatePath("/log");
  revalidatePath("/today");
  revalidatePath("/progress");
}
