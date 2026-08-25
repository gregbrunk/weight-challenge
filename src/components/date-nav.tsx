import Link from "next/link";
import { addDays, formatWithWeekday, type PlainDate } from "@/lib/date";

interface Props {
  /** The screen this navigates within, e.g. "/log" or "/today". */
  basePath: string;
  date: PlainDate;
  planStart: PlainDate;
  planEnd: PlainDate;
  /** Today in the app's timezone, so "Today" can be offered and marked. */
  today: PlainDate;
  dayNumber: number;
  totalDays: number;
}

/**
 * Moves between days within a plan.
 *
 * Server-rendered links rather than client-side state: each day is a real URL,
 * so back works, a particular day can be bookmarked, and the page arrives with
 * its data already in place. Arrows are disabled at the plan's edges instead of
 * silently doing nothing.
 */
export function DateNav({
  basePath,
  date,
  planStart,
  planEnd,
  today,
  dayNumber,
  totalDays,
}: Props) {
  const previous = addDays(date, -1);
  const next = addDays(date, 1);
  const hasPrevious = previous >= planStart;
  const hasNext = next <= planEnd;
  const isToday = date === today;
  const todayInPlan = today >= planStart && today <= planEnd;

  return (
    <nav className="date-nav" aria-label="Choose a day">
      <ArrowLink
        href={`${basePath}?date=${previous}`}
        enabled={hasPrevious}
        label={`Previous day, ${formatWithWeekday(previous)}`}
        direction="previous"
      />

      <div className="date-nav-current">
        <p className="date-nav-date">
          {formatWithWeekday(date)}
          {isToday && (
            <span className="badge badge-neutral" style={{ marginLeft: "var(--space-xs)" }}>
              Today
            </span>
          )}
        </p>
        <p className="label-caps">
          Day {dayNumber} of {totalDays}
        </p>
      </div>

      <ArrowLink
        href={`${basePath}?date=${next}`}
        enabled={hasNext}
        label={`Next day, ${formatWithWeekday(next)}`}
        direction="next"
      />

      {!isToday && todayInPlan && (
        <Link href={`${basePath}?date=${today}`} className="btn btn-ghost btn-sm date-nav-today">
          Jump to today
        </Link>
      )}
    </nav>
  );
}

function ArrowLink({
  href,
  enabled,
  label,
  direction,
}: {
  href: string;
  enabled: boolean;
  label: string;
  direction: "previous" | "next";
}) {
  const icon = direction === "previous" ? "‹" : "›";

  // A disabled arrow stays in the layout and stays announced, so the control
  // doesn't jump around at the ends of the plan.
  if (!enabled) {
    return (
      <span className="btn btn-secondary btn-icon date-nav-arrow" aria-disabled="true">
        <span aria-hidden="true">{icon}</span>
        <span className="sr-only">{label} — outside the plan</span>
      </span>
    );
  }

  return (
    <Link href={href} className="btn btn-secondary btn-icon date-nav-arrow">
      <span aria-hidden="true">{icon}</span>
      <span className="sr-only">{label}</span>
    </Link>
  );
}
