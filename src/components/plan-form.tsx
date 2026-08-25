"use client";

import { useActionState, useId, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { NumberField } from "./number-field";
import { planTargets, type PlanInput } from "@/lib/calc";
import { formatCalories, formatWeight } from "@/lib/format";
import { formatLong, isPlainDate, type PlainDate } from "@/lib/date";
import { createPlanAction, updatePlanAction } from "@/actions/plan";
import { initialPlanFormState, type PlanFormState } from "@/actions/plan-state";

/** Every field is held as a string so a half-typed number never becomes NaN. */
export interface PlanFormValues {
  name: string;
  startDate: string;
  days: string;
  rmr: string;
  targetActiveCals: string;
  lbsToLose: string;
  calsPerLb: string;
  startWeight: string;
  startBodyFat: string;
  startVo2Max: string;
  startSystolic: string;
  startDiastolic: string;
}

interface Props {
  mode: "create" | "edit";
  planId?: string;
  initialValues: PlanFormValues;
}

export function PlanForm({ mode, planId, initialValues }: Props) {
  const action = mode === "create" ? createPlanAction : updatePlanAction;
  const [state, formAction] = useActionState<PlanFormState, FormData>(
    action,
    initialPlanFormState,
  );
  const [values, setValues] = useState<PlanFormValues>(initialValues);

  const set = <K extends keyof PlanFormValues>(key: K) =>
    (value: string) => setValues((current) => ({ ...current, [key]: value }));

  const preview = usePlanPreview(values);
  const summaryId = useId();

  return (
    <form action={formAction} className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
      {planId && <input type="hidden" name="id" value={planId} />}

      <div className="flex min-w-0 flex-1 flex-col gap-6">
        {state.message && (
          <p role="alert" className="alert alert-danger">
            <span aria-hidden="true" className="alert-icon">
              ⚠
            </span>
            <span>{state.message}</span>
          </p>
        )}

        <Section title="The plan" description="What you're calling it and how long it runs.">
          <div className="field">
            <label className="field-label" htmlFor="plan-name">
              Plan name
            </label>
            <input
              id="plan-name"
              name="name"
              type="text"
              className="field-input"
              value={values.name}
              onChange={(event) => set("name")(event.target.value)}
              maxLength={60}
              required
              aria-invalid={state.errors.name ? true : undefined}
              aria-describedby={state.errors.name ? "plan-name-error" : undefined}
            />
            {state.errors.name && (
              <p id="plan-name-error" className="field-error">
                {state.errors.name}
              </p>
            )}
          </div>

          <div className="field">
            <label className="field-label" htmlFor="plan-start">
              Start date
            </label>
            <input
              id="plan-start"
              name="startDate"
              type="date"
              className="field-input"
              value={values.startDate}
              onChange={(event) => set("startDate")(event.target.value)}
              required
              aria-invalid={state.errors.startDate ? true : undefined}
            />
            {state.errors.startDate && (
              <p className="field-error">{state.errors.startDate}</p>
            )}
          </div>

          <NumberField
            label="Length"
            name="days"
            value={values.days}
            onChange={set("days")}
            unit="days"
            step="1"
            min={1}
            max={730}
            required
            error={state.errors.days}
            help={
              preview.endDate
                ? `Runs through ${preview.endDate}.`
                : "Counting the start date as day 1."
            }
          />
        </Section>

        <Section
          title="Goal and energy"
          description="These four numbers drive every target in the app."
        >
          <NumberField
            label="Pounds to lose"
            name="lbsToLose"
            value={values.lbsToLose}
            onChange={set("lbsToLose")}
            unit="lb"
            step="0.1"
            min={0.1}
            decimal
            required
            error={state.errors.lbsToLose}
          />

          <NumberField
            label="Resting metabolic rate"
            name="rmr"
            value={values.rmr}
            onChange={set("rmr")}
            unit="cal"
            step="1"
            required
            error={state.errors.rmr}
            help="What you burn in a day at rest. An estimate is fine."
          />

          <NumberField
            label="Daily exercise target"
            name="targetActiveCals"
            value={values.targetActiveCals}
            onChange={set("targetActiveCals")}
            unit="cal"
            step="1"
            required
            error={state.errors.targetActiveCals}
            help="Active calories you intend to burn each day."
          />

          <details className="mt-1">
            <summary
              className="cursor-pointer text-muted"
              style={{ fontSize: "var(--text-body-sm)" }}
            >
              Advanced
            </summary>
            <div style={{ marginTop: "var(--space-md)" }}>
              <NumberField
                label="Calories per pound"
                name="calsPerLb"
                value={values.calsPerLb}
                onChange={set("calsPerLb")}
                unit="cal"
                step="1"
                required
                error={state.errors.calsPerLb}
                help="3,500 is the standard figure. Change it only if you have a reason to."
              />
            </div>
          </details>
        </Section>

        <Section
          title="Starting measurements"
          description="Your baseline. Every progress number is measured against these, and you can leave any of them blank."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              label="Weight"
              name="startWeight"
              value={values.startWeight}
              onChange={set("startWeight")}
              unit="lb"
              step="0.1"
              decimal
              error={state.errors.startWeight}
            />
            <NumberField
              label="Body fat"
              name="startBodyFat"
              value={values.startBodyFat}
              onChange={set("startBodyFat")}
              unit="%"
              step="0.1"
              decimal
              error={state.errors.startBodyFat}
            />
            <NumberField
              label="VO2 max"
              name="startVo2Max"
              value={values.startVo2Max}
              onChange={set("startVo2Max")}
              step="0.1"
              decimal
              error={state.errors.startVo2Max}
            />
            <div />
            <NumberField
              label="Systolic"
              name="startSystolic"
              value={values.startSystolic}
              onChange={set("startSystolic")}
              step="1"
              error={state.errors.startSystolic}
            />
            <NumberField
              label="Diastolic"
              name="startDiastolic"
              value={values.startDiastolic}
              onChange={set("startDiastolic")}
              step="1"
              error={state.errors.startDiastolic}
            />
          </div>
        </Section>

        <div className="flex flex-col gap-3 sm:flex-row-reverse sm:justify-start">
          <SubmitButton mode={mode} />
          {mode === "edit" && (
            <Link href="/plan" className="btn btn-secondary">
              Cancel
            </Link>
          )}
        </div>
      </div>

      {/* Targets update as you type, so the consequences of a change are visible
          before you commit to it. */}
      <aside
        aria-labelledby={summaryId}
        className="w-full lg:sticky lg:top-6 lg:w-[340px] lg:flex-shrink-0"
      >
        <div className="card card-raised">
          <h2
            id={summaryId}
            className="label-caps"
            style={{ marginBottom: "var(--space-md)" }}
          >
            Your targets
          </h2>

          <SummaryRow
            label="Necessary daily deficit"
            value={preview.necessaryDailyDeficit}
            unit="cal"
            emphasis
          />
          <SummaryRow
            label="Daily food ceiling"
            value={preview.allowedFoodCals}
            unit="cal"
            emphasis
          />

          <hr
            style={{
              border: 0,
              borderTop: "1px solid var(--color-divider)",
              margin: "var(--space-md) 0",
            }}
          />

          <SummaryRow label="Total deficit" value={preview.totalDeficitTarget} unit="cal" />
          <SummaryRow label="Target weight" value={preview.targetWeight} unit="lb" />
          <SummaryRow label="Ends" value={preview.endDate} />

          {preview.warning && (
            <p
              className="text-muted"
              style={{
                fontSize: "var(--text-body-sm)",
                marginTop: "var(--space-md)",
                paddingTop: "var(--space-md)",
                borderTop: "1px solid var(--color-divider)",
              }}
            >
              {preview.warning}
            </p>
          )}
        </div>
      </aside>
    </form>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="card">
      <legend className="sr-only">{title}</legend>
      <h2
        style={{
          fontSize: "var(--text-h4)",
          fontWeight: "var(--weight-bold)",
          lineHeight: "var(--leading-snug)",
        }}
      >
        {title}
      </h2>
      <p
        className="text-muted"
        style={{ fontSize: "var(--text-body-sm)", marginBottom: "var(--space-lg)" }}
      >
        {description}
      </p>
      <div className="flex flex-col gap-4">{children}</div>
    </fieldset>
  );
}

function SummaryRow({
  label,
  value,
  unit,
  emphasis = false,
}: {
  label: string;
  value: string;
  unit?: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className="flex items-baseline justify-between gap-3"
      style={{ marginBottom: "var(--space-sm)" }}
    >
      <span
        className="text-muted"
        style={{ fontSize: "var(--text-body-sm)" }}
      >
        {label}
      </span>
      <span
        className="numeric"
        style={{
          fontSize: emphasis ? "var(--text-h4)" : "var(--text-body-md)",
          fontWeight: emphasis ? "var(--weight-bold)" : "var(--weight-medium)",
          whiteSpace: "nowrap",
        }}
      >
        {value}
        {unit && value !== "—" && (
          <span
            className="text-muted"
            style={{ fontSize: "var(--text-body-sm)", marginLeft: "var(--space-2xs)" }}
          >
            {unit}
          </span>
        )}
      </span>
    </div>
  );
}

function SubmitButton({ mode }: { mode: "create" | "edit" }) {
  const { pending } = useFormStatus();
  const label = mode === "create" ? "Start this plan" : "Save changes";

  return (
    <button
      type="submit"
      className="btn btn-primary btn-lg"
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? `${label}…` : label}
    </button>
  );
}

/**
 * Runs the same `planTargets` the rest of the app uses, against whatever is
 * currently typed. Anything not yet valid shows an em dash rather than a
 * misleading zero.
 */
function usePlanPreview(values: PlanFormValues) {
  return useMemo(() => {
    const num = (raw: string): number | null => {
      if (raw.trim() === "") return null;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const days = num(values.days);
    const rmr = num(values.rmr);
    const active = num(values.targetActiveCals);
    const lbs = num(values.lbsToLose);
    const calsPerLb = num(values.calsPerLb);
    const startWeight = num(values.startWeight);
    const startDate = values.startDate;

    const complete =
      days !== null &&
      days > 0 &&
      rmr !== null &&
      active !== null &&
      lbs !== null &&
      calsPerLb !== null &&
      calsPerLb > 0 &&
      isPlainDate(startDate);

    if (!complete) {
      return {
        necessaryDailyDeficit: "—",
        allowedFoodCals: "—",
        totalDeficitTarget: "—",
        targetWeight: "—",
        endDate: "",
        warning: null as string | null,
      };
    }

    const plan: PlanInput = {
      startDate: startDate as PlainDate,
      days: days!,
      rmr: rmr!,
      targetActiveCals: active!,
      lbsToLose: lbs!,
      calsPerLb: calsPerLb!,
      startWeight,
      startBodyFat: null,
      startVo2Max: null,
      startSystolic: null,
      startDiastolic: null,
    };

    const targets = planTargets(plan);

    // A food ceiling this low isn't a rounding artefact — it means the goal and
    // the timeline can't both hold. Better to say so before the plan starts.
    let warning: string | null = null;
    if (targets.allowedFoodCals < 1200) {
      warning =
        targets.allowedFoodCals <= 0
          ? "This goal isn't reachable in this many days — the food ceiling comes out at or below zero. Give it more days, lower the goal, or raise the exercise target."
          : "That leaves you under 1,200 calories of food a day. Consider more days or a smaller goal.";
    }

    return {
      necessaryDailyDeficit: formatCalories(targets.necessaryDailyDeficit),
      allowedFoodCals: formatCalories(targets.allowedFoodCals),
      totalDeficitTarget: formatCalories(targets.totalDeficitTarget),
      targetWeight: formatWeight(targets.targetWeight),
      endDate: formatLong(targets.endDate),
      warning,
    };
  }, [values]);
}
