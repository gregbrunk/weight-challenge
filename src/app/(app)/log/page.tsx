import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AutosaveField } from "@/components/autosave-field";
import { DateNav } from "@/components/date-nav";
import { planTargets } from "@/lib/calc";
import { daysBetween, isPlainDate, type PlainDate } from "@/lib/date";
import { formatCalories, numberToInputValue } from "@/lib/format";
import { getActivePlan, getEntry, toPlanInput } from "@/lib/plans";
import { getToday } from "@/lib/timezone-server";
import { fractionToPercent } from "@/lib/validation";

export const metadata: Metadata = {
  title: "Log · Weight Challenge",
};

export default async function LogPage({ searchParams }: PageProps<"/log">) {
  const plan = await getActivePlan();
  if (!plan) redirect("/plan/new");

  const planInput = toPlanInput(plan);
  const targets = planTargets(planInput);
  const today = await getToday();

  const date = resolveDate(
    (await searchParams).date,
    today,
    planInput.startDate,
    targets.endDate,
  );
  const entry = await getEntry(plan.id, date);

  const value = (raw: number | null | undefined) => numberToInputValue(raw ?? null);

  return (
    <>
      <header style={{ marginBottom: "var(--space-lg)" }}>
        <p className="label-caps">{plan.name}</p>
        <h1 className="page-title">Log</h1>
      </header>

      <DateNav
        basePath="/log"
        date={date}
        planStart={planInput.startDate}
        planEnd={targets.endDate}
        today={today}
        dayNumber={daysBetween(planInput.startDate, date) + 1}
        totalDays={plan.days}
      />

      <p
        className="text-muted"
        style={{ fontSize: "var(--text-body-sm)", marginBottom: "var(--space-lg)" }}
      >
        Every field saves on its own as you fill it in. Come back through the day
        and add the rest — nothing here needs finishing in one sitting.
      </p>

      <div className="flex flex-col gap-4">
        <Group title="Morning" hint="On the scale">
          <AutosaveField
            date={date}
            field="weight"
            label="Weight"
            initialValue={value(entry?.weight)}
            unit="lb"
            step="0.1"
            decimal
          />
          <AutosaveField
            date={date}
            field="bodyFat"
            label="Body fat"
            initialValue={value(fractionToPercent(entry?.bodyFat ?? null))}
            unit="%"
            step="0.1"
            decimal
          />
        </Group>

        <Group title="Any time" hint="When you take a reading">
          <AutosaveField
            date={date}
            field="systolic"
            label="Blood pressure — systolic"
            initialValue={value(entry?.systolic)}
            step="1"
          />
          <AutosaveField
            date={date}
            field="diastolic"
            label="Blood pressure — diastolic"
            initialValue={value(entry?.diastolic)}
            step="1"
          />
          <AutosaveField
            date={date}
            field="vo2Max"
            label="VO2 max"
            initialValue={value(entry?.vo2Max)}
            step="0.1"
            decimal
          />
        </Group>

        <Group title="Evening" hint="Once the day's eating and training is done">
          <AutosaveField
            date={date}
            field="consumedCals"
            label="Calories consumed"
            initialValue={value(entry?.consumedCals)}
            unit="cal"
            step="1"
            help={`Your ceiling is ${formatCalories(targets.allowedFoodCals)}.`}
          />
          <AutosaveField
            date={date}
            field="activeCals"
            label="Active calories burned"
            initialValue={value(entry?.activeCals)}
            unit="cal"
            step="1"
            help={`Your floor is ${formatCalories(targets.targetActiveCals)}.`}
          />
        </Group>
      </div>
    </>
  );
}

function Group({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card">
      <p className="log-group-time">{title}</p>
      <p
        className="text-muted"
        style={{ fontSize: "var(--text-body-sm)", marginBottom: "var(--space-lg)" }}
      >
        {hint}
      </p>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

/**
 * Picks the day to show: whatever's in the URL if it's a real date inside the
 * plan, otherwise today, otherwise the nearest end of the plan. A plan you're
 * revisiting after it finished should open on its last day, not bounce you to a
 * date it doesn't cover.
 */
function resolveDate(
  raw: string | string[] | undefined,
  today: PlainDate,
  start: PlainDate,
  end: PlainDate,
): PlainDate {
  const requested = typeof raw === "string" && isPlainDate(raw) ? raw : null;
  const candidate = requested ?? today;

  if (candidate < start) return start;
  if (candidate > end) return end;
  return candidate;
}
