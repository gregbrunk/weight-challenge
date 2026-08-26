"use client";

import { useState } from "react";
import type { CalendarMonth, TaskStats } from "@/lib/streaks";
import { formatPercent } from "@/lib/format";

export interface StreakCardTask {
  id: string;
  name: string;
  autoNote: string | null;
  stats: TaskStats;
  calendar: CalendarMonth[];
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * One task's record: the streak, the tally, and a calendar of every day.
 *
 * The calendar is collapsed by default. With four or five tasks across a
 * three-month plan, showing every grid at once buries the numbers people
 * actually came for under a wall of squares.
 */
export function StreakCard({ task }: { task: StreakCardTask }) {
  const [open, setOpen] = useState(false);
  const { stats } = task;

  return (
    <section className="card">
      <div className="streak-head">
        <div className="min-w-0">
          <h3 className="streak-name">{task.name}</h3>
          {task.autoNote && <p className="task-note">{task.autoNote}</p>}
        </div>

        <div className="streak-figures">
          <span
            className="streak-current"
            data-pending={stats.pendingToday || undefined}
            title={
              stats.pendingToday
                ? "Today isn't ticked yet — the streak still stands"
                : undefined
            }
          >
            <span aria-hidden="true">🔥</span>
            <span className="numeric">{stats.currentStreak}</span>
          </span>
          <span className="label-caps">current</span>
        </div>
      </div>

      <div className="streak-stats">
        <Stat
          label="Done"
          value={`${stats.completedDays}/${stats.eligibleDays}`}
          note={formatPercent(stats.completionRate)}
        />
        <Stat label="Best streak" value={String(stats.bestStreak)} note="days in a row" />
        <Stat
          label="Today"
          value={stats.doneToday === null ? "—" : stats.doneToday ? "Done" : "Not yet"}
          note={stats.doneToday === null ? "outside this task" : undefined}
        />
      </div>

      {task.calendar.length > 0 && (
        <>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
          >
            {open ? "Hide calendar" : "Show calendar"}
          </button>

          {open && (
            <div className="streak-calendars">
              {task.calendar.map((month) => (
                <div key={month.month} className="calendar">
                  <p className="label-caps calendar-title">{month.label}</p>

                  <div className="calendar-grid" role="presentation">
                    {WEEKDAYS.map((day, index) => (
                      <span key={index} className="calendar-weekday" aria-hidden="true">
                        {day}
                      </span>
                    ))}

                    {month.cells.map((cell, index) =>
                      cell.blank ? (
                        <span key={`blank-${index}`} className="calendar-cell" />
                      ) : (
                        <span
                          key={cell.date}
                          className="calendar-cell"
                          data-in-window={cell.inWindow || undefined}
                          data-done={cell.done || undefined}
                          data-today={cell.isToday || undefined}
                          data-future={cell.isFuture || undefined}
                          title={
                            cell.inWindow
                              ? `${cell.date}: ${cell.done ? "done" : cell.isFuture ? "not yet" : "missed"}`
                              : `${cell.date}: outside the plan`
                          }
                        >
                          {Number(cell.date.slice(8))}
                        </span>
                      ),
                    )}
                  </div>
                </div>
              ))}

              <p className="calendar-key">
                <span className="calendar-cell" data-in-window data-done aria-hidden="true" />
                done
                <span className="calendar-cell" data-in-window aria-hidden="true" />
                missed
                <span className="calendar-cell" data-in-window data-future aria-hidden="true" />
                still to come
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <p className="label-caps">{label}</p>
      <p className="streak-stat-value numeric">{value}</p>
      {note && <p className="stat-best">{note}</p>}
    </div>
  );
}
