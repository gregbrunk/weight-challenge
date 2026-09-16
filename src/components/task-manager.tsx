"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createTaskAction,
  deleteTaskAction,
  moveTaskAction,
  updateTaskAction,
} from "@/actions/task";
import { initialTaskFormState } from "@/actions/task-state";
import { AUTO_RULE_LABELS, type TaskAutoRule } from "@/lib/streaks";

export interface ManagedTask {
  id: string;
  name: string;
  autoRule: TaskAutoRule;
  /** Shown so it's clear why a task added late has a shorter record. */
  startedLate: boolean;
  startDateLabel: string;
}

/**
 * Creating and editing the daily tasks for a plan.
 *
 * Deliberately plain: a list with rename in place, reorder arrows and a delete
 * that says exactly what it will destroy. These are set up once and touched
 * rarely, so discoverability beats polish.
 */
export function TaskManager({
  tasks,
  foodCeiling,
  exerciseFloor,
  fastingGoal,
}: {
  tasks: ManagedTask[];
  foodCeiling: string;
  exerciseFloor: string;
  /** The plan's fasting goal, e.g. "18h", or null when fasting is off. */
  fastingGoal: string | null;
}) {
  const ruleOptions: RuleOption[] = [
    { value: "manual", label: AUTO_RULE_LABELS.manual },
    {
      value: "activeCalsAtLeastTarget",
      label: `Ticks when active calories reach ${exerciseFloor}`,
    },
    {
      value: "consumedCalsAtMostCeiling",
      label: `Ticks when eaten calories stay under ${foodCeiling}`,
    },
    // Offered only when the plan fasts. A task pinned to a goal the plan
    // doesn't have could never tick, which would read as a broken habit
    // rather than a setting that doesn't apply.
    ...(fastingGoal === null
      ? []
      : [
          {
            value: "fastGoalMet" as const,
            label: `Ticks when your fast reaches ${fastingGoal}`,
          },
        ]),
  ];

  return (
    <div className="flex flex-col" style={{ gap: "var(--space-lg)" }}>
      {tasks.length === 0 ? (
        <p className="text-muted" style={{ fontSize: "var(--text-body-md)" }}>
          No tasks yet. Add the handful of things you need to do each day to hit your
          numbers — they&apos;ll appear on the Log screen with a streak count.
        </p>
      ) : (
        <ul className="task-manage-list">
          {tasks.map((task, index) => (
            <TaskRow
              key={task.id}
              task={task}
              ruleOptions={ruleOptions}
              isFirst={index === 0}
              isLast={index === tasks.length - 1}
            />
          ))}
        </ul>
      )}

      <AddTaskForm ruleOptions={ruleOptions} />
    </div>
  );
}

interface RuleOption {
  value: TaskAutoRule;
  label: string;
}

/**
 * The options a row may show, always including the rule it already uses.
 *
 * Turning fasting off withdraws the fasting option, and a select whose value
 * isn't among its options falls back to the first one — so saving an unrelated
 * rename would quietly convert a fasting task into a manual one.
 */
function optionsIncluding(options: RuleOption[], rule: TaskAutoRule): RuleOption[] {
  return options.some((option) => option.value === rule)
    ? options
    : [...options, { value: rule, label: AUTO_RULE_LABELS[rule] }];
}

function TaskRow({
  task,
  ruleOptions,
  isFirst,
  isLast,
}: {
  task: ManagedTask;
  ruleOptions: RuleOption[];
  isFirst: boolean;
  isLast: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [state, formAction] = useActionState(updateTaskAction, initialTaskFormState);
  const id = useId();

  if (editing) {
    return (
      <li className="task-manage-row">
        <form
          action={async (formData) => {
            await formAction(formData);
            setEditing(false);
          }}
          className="flex flex-col gap-3"
          style={{ width: "100%" }}
        >
          <input type="hidden" name="id" value={task.id} />

          <div className="field">
            <label className="field-label" htmlFor={`${id}-name`}>
              Task name
            </label>
            <input
              id={`${id}-name`}
              name="name"
              type="text"
              className="field-input"
              defaultValue={task.name}
              maxLength={60}
              required
              autoFocus
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor={`${id}-rule`}>
              How it&apos;s completed
            </label>
            <select
              id={`${id}-rule`}
              name="autoRule"
              className="field-input"
              defaultValue={task.autoRule}
            >
              {optionsIncluding(ruleOptions, task.autoRule).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {state.message && <p className="field-error">{state.message}</p>}

          <div className="flex gap-2">
            <SaveButton />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="task-manage-row">
      <div className="task-manage-body">
        <p className="task-name">{task.name}</p>
        <p className="task-note">
          {AUTO_RULE_LABELS[task.autoRule]}
          {task.startedLate && ` · counting from ${task.startDateLabel}`}
        </p>

        {confirming && (
          <div className="alert alert-danger" style={{ marginTop: "var(--space-sm)" }}>
            <span aria-hidden="true" className="alert-icon">
              ⚠
            </span>
            <div>
              <p style={{ marginBottom: "var(--space-sm)" }}>
                Delete <strong>{task.name}</strong> and every day you&apos;ve ticked it?
                This can&apos;t be undone.
              </p>
              <div className="flex gap-2">
                <form action={deleteTaskAction}>
                  <input type="hidden" name="id" value={task.id} />
                  <button type="submit" className="btn btn-danger btn-sm">
                    Delete it
                  </button>
                </form>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setConfirming(false)}
                >
                  Keep it
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="task-manage-actions">
        <form action={moveTaskAction}>
          <input type="hidden" name="id" value={task.id} />
          <input type="hidden" name="direction" value="up" />
          <button
            type="submit"
            className="btn btn-ghost btn-icon btn-sm"
            disabled={isFirst}
            aria-label={`Move ${task.name} up`}
          >
            <span aria-hidden="true">↑</span>
          </button>
        </form>

        <form action={moveTaskAction}>
          <input type="hidden" name="id" value={task.id} />
          <input type="hidden" name="direction" value="down" />
          <button
            type="submit"
            className="btn btn-ghost btn-icon btn-sm"
            disabled={isLast}
            aria-label={`Move ${task.name} down`}
          >
            <span aria-hidden="true">↓</span>
          </button>
        </form>

        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setEditing(true)}
        >
          Edit
        </button>

        {!confirming && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setConfirming(true)}
          >
            Delete
          </button>
        )}
      </div>
    </li>
  );
}

function AddTaskForm({ ruleOptions }: { ruleOptions: RuleOption[] }) {
  const [state, formAction] = useActionState(createTaskAction, initialTaskFormState);
  const id = useId();

  // Remounting on success clears the field without an effect or a controlled
  // input, the same trick the password form uses.
  const formKey = state.status === "saved" ? "added" : "adding";

  return (
    <form key={formKey} action={formAction} className="flex flex-col gap-3">
      <div className="field">
        <label className="field-label" htmlFor={`${id}-name`}>
          Add a task
        </label>
        <input
          id={`${id}-name`}
          name="name"
          type="text"
          className="field-input"
          placeholder="No eating out"
          maxLength={60}
          required
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor={`${id}-rule`}>
          How it&apos;s completed
        </label>
        <select id={`${id}-rule`} name="autoRule" className="field-input" defaultValue="manual">
          {ruleOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="field-help">
          A new task starts counting from today, so adding one mid-plan
          doesn&apos;t arrive with a record of misses.
        </p>
      </div>

      {state.message && (
        <p role="alert" className="field-error">
          {state.message}
        </p>
      )}

      <div>
        <AddButton />
      </div>
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary btn-sm" disabled={pending} aria-busy={pending}>
      {pending ? "Saving…" : "Save"}
    </button>
  );
}

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-secondary" disabled={pending} aria-busy={pending}>
      {pending ? "Adding…" : "Add task"}
    </button>
  );
}
