/**
 * Daily task and completion storage.
 *
 * Completions are rows keyed by (task, date). The row's existence is the
 * completion — unticking deletes it — so there is no third "recorded as not
 * done" state for anything downstream to reason about.
 */

// Importing this from a client component is a build error, not a runtime
// one — which is the point. Three separate bugs in this project were a
// client component pulling a server module in through a shared constant.
import "server-only";

import type { Task } from "@/generated/prisma/client";
import { prisma } from "./db";
import { fromDbDate, getEntryInputs, toDbDate } from "./plans";
import type { EntryInput } from "./calc";
import type { PlainDate } from "./date";
import type { TaskAutoRule, TaskInput } from "./streaks";

export function toTaskInput(task: Task): TaskInput {
  return {
    id: task.id,
    name: task.name,
    position: task.position,
    autoRule: task.autoRule as TaskAutoRule,
    startDate: fromDbDate(task.startDate),
  };
}

export async function listTasks(planId: string): Promise<Task[]> {
  return prisma.task.findMany({
    where: { planId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
}

export async function getTask(id: string): Promise<Task | null> {
  return prisma.task.findUnique({ where: { id } });
}

export async function createTask(params: {
  planId: string;
  name: string;
  autoRule: TaskAutoRule;
  /** Normally today, clamped to the plan's start by the caller. */
  startDate: PlainDate;
}): Promise<Task> {
  const { planId, name, autoRule, startDate } = params;

  // Append to the end rather than renumbering everything.
  const last = await prisma.task.findFirst({
    where: { planId },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  return prisma.task.create({
    data: {
      planId,
      name,
      autoRule,
      startDate: toDbDate(startDate),
      position: (last?.position ?? -1) + 1,
    },
  });
}

export async function updateTask(
  id: string,
  fields: { name?: string; autoRule?: TaskAutoRule },
): Promise<Task> {
  return prisma.task.update({ where: { id }, data: fields });
}

/** Removes the task and, by cascade, every completion recorded against it. */
export async function deleteTask(id: string): Promise<void> {
  await prisma.task.delete({ where: { id } });
}

/**
 * Moves a task one place up or down.
 *
 * Swaps positions with its neighbour inside a transaction, so a failure can't
 * leave two tasks claiming the same slot.
 */
export async function moveTask(id: string, direction: "up" | "down"): Promise<void> {
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return;

  const neighbour = await prisma.task.findFirst({
    where: {
      planId: task.planId,
      position: direction === "up" ? { lt: task.position } : { gt: task.position },
    },
    orderBy: { position: direction === "up" ? "desc" : "asc" },
  });
  if (!neighbour) return;

  await prisma.$transaction([
    prisma.task.update({ where: { id: task.id }, data: { position: neighbour.position } }),
    prisma.task.update({ where: { id: neighbour.id }, data: { position: task.position } }),
  ]);
}

/** Every completion in a plan, grouped by task. */
export async function getCompletionsByTask(
  planId: string,
): Promise<Map<string, Set<PlainDate>>> {
  const rows = await prisma.taskCompletion.findMany({
    where: { task: { planId } },
    select: { taskId: true, date: true },
  });

  const byTask = new Map<string, Set<PlainDate>>();
  for (const row of rows) {
    const set = byTask.get(row.taskId) ?? new Set<PlainDate>();
    set.add(fromDbDate(row.date));
    byTask.set(row.taskId, set);
  }

  return byTask;
}

/**
 * Ticks or unticks one task on one day.
 *
 * The upsert/delete pair is idempotent: ticking twice is still ticked, and
 * unticking something that was never ticked is not an error. That matters
 * because the checkbox fires optimistically and a retry must not break.
 */
export async function setCompletion(
  taskId: string,
  date: PlainDate,
  done: boolean,
): Promise<void> {
  const dbDate = toDbDate(date);

  if (done) {
    await prisma.taskCompletion.upsert({
      where: { taskId_date: { taskId, date: dbDate } },
      create: { taskId, date: dbDate },
      update: {},
    });
  } else {
    await prisma.taskCompletion.deleteMany({ where: { taskId, date: dbDate } });
  }
}

export interface TaskContext {
  tasks: Task[];
  completionsByTask: Map<string, Set<PlainDate>>;
  entriesByDate: Map<PlainDate, EntryInput>;
}

/**
 * Everything needed to work out any task's state on any day.
 *
 * Loaded in one go because auto-linked tasks read the day's calories, so the
 * entries are needed even on screens that only show checkboxes.
 */
export async function getTaskContext(planId: string): Promise<TaskContext> {
  const [tasks, completionsByTask, entries] = await Promise.all([
    listTasks(planId),
    getCompletionsByTask(planId),
    getEntryInputs(planId),
  ]);

  return {
    tasks,
    completionsByTask,
    entriesByDate: new Map(entries.map((entry) => [entry.date, entry])),
  };
}
