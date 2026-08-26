"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/server";
import { planTargets } from "@/lib/calc";
import { compareDates, isPlainDate, type PlainDate } from "@/lib/date";
import { getActivePlan, toPlanInput } from "@/lib/plans";
import {
  createTask,
  deleteTask,
  getTask,
  moveTask,
  setCompletion,
  updateTask,
} from "@/lib/tasks";
import { getToday } from "@/lib/timezone-server";
import type { TaskAutoRule } from "@/lib/streaks";
import type { TaskFormState } from "./task-state";

const AUTO_RULES: TaskAutoRule[] = [
  "manual",
  "activeCalsAtLeastTarget",
  "consumedCalsAtMostCeiling",
];

function parseAutoRule(value: unknown): TaskAutoRule | null {
  return typeof value === "string" && (AUTO_RULES as string[]).includes(value)
    ? (value as TaskAutoRule)
    : null;
}

const MAX_NAME = 60;

/**
 * Adds a task to the active plan.
 *
 * The task counts from the plan's first day. An earlier version started it on
 * the day it was created, reasoning that a habit added on day 20 shouldn't
 * arrive with nineteen recorded failures — but that made the ordinary case
 * wrong: set your tasks up on day 2, tick day 1, and the tick fell outside the
 * task's window and counted for nothing. These are the plan's rules, so they
 * run for the whole plan.
 */
export async function createTaskAction(
  _previous: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  await requireAuth();

  const name = String(formData.get("name") ?? "").trim();
  const autoRule = parseAutoRule(formData.get("autoRule")) ?? "manual";

  if (name === "") return { status: "error", message: "Give the task a name." };
  if (name.length > MAX_NAME) {
    return { status: "error", message: `Keep the name under ${MAX_NAME} characters.` };
  }

  const plan = await getActivePlan();
  if (!plan) return { status: "error", message: "There's no active plan to add tasks to." };

  const planInput = toPlanInput(plan);

  await createTask({
    planId: plan.id,
    name,
    autoRule,
    startDate: planInput.startDate,
  });

  revalidatePath("/", "layout");
  return { status: "saved", message: null };
}

export async function updateTaskAction(
  _previous: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  await requireAuth();

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const autoRule = parseAutoRule(formData.get("autoRule"));

  if (!id) return { status: "error", message: "That task no longer exists." };
  if (name === "") return { status: "error", message: "Give the task a name." };
  if (name.length > MAX_NAME) {
    return { status: "error", message: `Keep the name under ${MAX_NAME} characters.` };
  }

  if (!(await belongsToActivePlan(id))) {
    return { status: "error", message: "That task isn't part of the current plan." };
  }

  await updateTask(id, { name, ...(autoRule ? { autoRule } : {}) });

  revalidatePath("/", "layout");
  return { status: "saved", message: null };
}

/** Deletes a task and every completion recorded against it. */
export async function deleteTaskAction(formData: FormData): Promise<void> {
  await requireAuth();

  const id = String(formData.get("id") ?? "");
  if (id && (await belongsToActivePlan(id))) await deleteTask(id);

  revalidatePath("/", "layout");
}

export async function moveTaskAction(formData: FormData): Promise<void> {
  await requireAuth();

  const id = String(formData.get("id") ?? "");
  const direction = formData.get("direction") === "up" ? "up" : "down";
  if (id && (await belongsToActivePlan(id))) await moveTask(id, direction);

  revalidatePath("/", "layout");
}

export type ToggleResult = { ok: true; done: boolean } | { ok: false; error: string };

/**
 * Ticks or unticks a task for a day.
 *
 * Called straight from the checkbox rather than through a form, so it returns
 * a result the component can show inline instead of redirecting.
 */
export async function toggleTaskAction(input: {
  taskId: string;
  date: string;
  done: boolean;
}): Promise<ToggleResult> {
  await requireAuth();

  if (!isPlainDate(input.date)) return { ok: false, error: "That isn't a valid date." };

  const task = await getTask(input.taskId);
  if (!task) return { ok: false, error: "That task no longer exists." };

  const plan = await getActivePlan();
  if (!plan || task.planId !== plan.id) {
    return { ok: false, error: "That task isn't part of the current plan." };
  }

  if (task.autoRule !== "manual") {
    return { ok: false, error: "This task ticks itself from your logged calories." };
  }

  const planInput = toPlanInput(plan);
  const planEnd = planTargets(planInput).endDate;
  if (
    compareDates(input.date, planInput.startDate) < 0 ||
    compareDates(input.date, planEnd) > 0
  ) {
    return { ok: false, error: "That date is outside this plan." };
  }

  // A day that hasn't happened can't have been done. The Log screen can be
  // navigated forward within the plan, so without this you could tick tomorrow
  // and see it counted on the calendar.
  const today = await getToday();
  if (compareDates(input.date, today) > 0) {
    return { ok: false, error: "That day hasn't happened yet." };
  }

  await setCompletion(input.taskId, input.date as PlainDate, input.done);

  revalidatePath("/log");
  revalidatePath("/progress");

  return { ok: true, done: input.done };
}

/** Guards every mutation: a stale page must not reach into an archived plan. */
async function belongsToActivePlan(taskId: string): Promise<boolean> {
  const [task, plan] = await Promise.all([getTask(taskId), getActivePlan()]);
  return Boolean(task && plan && task.planId === plan.id);
}
