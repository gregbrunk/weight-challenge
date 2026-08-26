"use client";

import { useState } from "react";
import { toggleTaskAction } from "@/actions/task";
import { AUTO_RULE_LABELS, type TaskAutoRule } from "@/lib/streaks";
import type { PlainDate } from "@/lib/date";

export interface ChecklistTask {
  id: string;
  name: string;
  autoRule: TaskAutoRule;
  done: boolean;
  currentStreak: number;
  /** True when the streak is alive from yesterday but today isn't done yet. */
  pendingToday: boolean;
}

/**
 * The day's tasks, ticked off one at a time.
 *
 * Ticking is optimistic: the box fills the moment you tap it and only reverts
 * if the server refuses. On a phone, a checkbox that waits for a round trip
 * before responding feels broken.
 *
 * Auto-linked tasks are shown but not tappable — they follow the day's logged
 * calories, and letting someone tick one by hand would put the display and the
 * numbers into permanent disagreement.
 */
export function TaskChecklist({
  date,
  tasks,
  isFuture = false,
}: {
  date: PlainDate;
  tasks: ChecklistTask[];
  /** A day that hasn't happened can't be ticked. */
  isFuture?: boolean;
}) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  async function toggle(task: ChecklistTask, next: boolean) {
    setOverrides((current) => ({ ...current, [task.id]: next }));
    setError(null);

    const result = await toggleTaskAction({ taskId: task.id, date, done: next });

    if (!result.ok) {
      // Put it back the way it was; the server is the authority.
      setOverrides((current) => ({ ...current, [task.id]: !next }));
      setError(result.error);
    }
  }

  return (
    <div>
      <ul className="task-list">
        {tasks.map((task) => {
          const done = overrides[task.id] ?? task.done;
          const auto = task.autoRule !== "manual" || isFuture;

          return (
            <li key={task.id} className="task-row">
              {auto ? (
                <span className="task-control" data-done={done || undefined}>
                  <span className="task-box" data-done={done || undefined} aria-hidden="true">
                    {done ? "✓" : ""}
                  </span>
                  <span className="task-body">
                    <span className="task-name">{task.name}</span>
                    <span className="task-note">
                      {isFuture && task.autoRule === "manual"
                        ? "Not yet — this day hasn't happened"
                        : AUTO_RULE_LABELS[task.autoRule]}
                    </span>
                  </span>
                </span>
              ) : (
                <label className="task-control" data-done={done || undefined}>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={done}
                    onChange={(event) => void toggle(task, event.target.checked)}
                  />
                  <span className="task-box" data-done={done || undefined} aria-hidden="true">
                    {done ? "✓" : ""}
                  </span>
                  <span className="task-body">
                    <span className="task-name">{task.name}</span>
                  </span>
                </label>
              )}

              <StreakBadge
                streak={task.currentStreak}
                done={done}
                pending={task.pendingToday}
              />
            </li>
          );
        })}
      </ul>

      {error && (
        <p role="alert" className="field-error" style={{ marginTop: "var(--space-sm)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * The streak beside a task.
 *
 * A zero reads as "—" rather than "0 days", which is a nicer thing to see on
 * the morning you start again.
 */
function StreakBadge({
  streak,
  done,
  pending,
}: {
  streak: number;
  done: boolean;
  pending: boolean;
}) {
  if (streak === 0 && !done) {
    return (
      <span className="task-streak task-streak-none" title="No streak yet">
        —
      </span>
    );
  }

  return (
    <span
      className="task-streak"
      data-pending={pending || undefined}
      title={
        pending
          ? "Still going — today isn't ticked yet"
          : `${streak} day${streak === 1 ? "" : "s"} in a row`
      }
    >
      <span aria-hidden="true">🔥</span>
      <span className="numeric">{streak}</span>
      <span className="sr-only">
        day{streak === 1 ? "" : "s"} in a row
        {pending ? ", today not yet ticked" : ""}
      </span>
    </span>
  );
}
