"use client";

import { useCallback, useId, useState } from "react";
import { saveFastTimeAction, type FastEdge } from "@/actions/fasting";
import type { PlainDate } from "@/lib/date";

type Status = "idle" | "saving" | "saved" | "error";

const SAVED_VISIBLE_MS = 2200;

export interface FastingLogProps {
  date: PlainDate;
  /** "HH:MM" in the app's timezone, or "" when nothing is logged. */
  startValue: string;
  endValue: string;
  /**
   * Whether a fast was started the day before. Without one there is nothing for
   * an end time to close, so the field is disabled rather than taking a value
   * the server would only refuse.
   */
  canEnd: boolean;
  /** When the fast being ended today began, e.g. "yesterday at 6:30 PM". */
  startedLabel: string | null;
  /** True only on the real today, which is the only day "now" makes sense on. */
  isToday: boolean;
  /**
   * Present only on the plan's first day. That day's fast begins the evening
   * *before* the plan, which has no row of its own — so the time is kept on the
   * plan and edited here, on the one day it means anything.
   */
  preStart: {
    value: string;
    /** "Aug 31", the evening it refers to. */
    dayLabel: string;
    /** True when that evening is today, which is the only time "now" fits. */
    offerNow: boolean;
  } | null;
}

/**
 * The day's two fasting times.
 *
 * They read in the order the day happens: the first meal closes last night's
 * fast, the last meal opens tonight's. That ordering is what makes the
 * two-rows-one-fast model legible on screen — the field at the top belongs to a
 * fast that began yesterday, and its caption says so.
 *
 * Each field saves itself, like everything else on this screen. The buttons are
 * a shortcut for "right now" and nothing more, because the common case is
 * eating at eleven and remembering to say so at two — which is exactly why the
 * time stays editable rather than being only a button.
 */
export function FastingLog({
  date,
  startValue,
  endValue,
  canEnd,
  startedLabel,
  isToday,
  preStart,
}: FastingLogProps) {
  return (
    <div className="flex flex-col" style={{ gap: "var(--space-lg)" }}>
      {/* First on the plan's first day, because chronologically it comes first:
          it is the evening before day one, which the first meal below closes. */}
      {preStart && (
        <FastTimeField
          date={date}
          edge="preStart"
          label={`Last meal on ${preStart.dayLabel}`}
          initialValue={preStart.value}
          disabled={false}
          nowLabel="Start fast now"
          offerNow={preStart.offerNow}
          help="The evening before the plan began. Log it and day one counts like any other day; leave it blank and day one sits out."
        />
      )}

      <FastTimeField
        date={date}
        edge="end"
        label="First meal"
        initialValue={endValue}
        disabled={!canEnd}
        nowLabel="End fast now"
        offerNow={isToday}
        help={
          canEnd
            ? startedLabel
              ? `Ends the fast you started ${startedLabel}.`
              : "Ends the fast you started the day before."
            : preStart
              ? "Log the evening before the plan above, and this opens up."
              : "No fast was started the day before, so there's nothing to end."
        }
      />

      <FastTimeField
        date={date}
        edge="start"
        label="Last meal"
        initialValue={startValue}
        disabled={false}
        nowLabel="Start fast now"
        offerNow={isToday}
        help="Begins tonight's fast. It's credited to tomorrow, once you log the first meal."
      />
    </div>
  );
}

function FastTimeField({
  date,
  edge,
  label,
  initialValue,
  disabled,
  nowLabel,
  offerNow,
  help,
}: {
  date: PlainDate;
  edge: FastEdge;
  label: string;
  initialValue: string;
  disabled: boolean;
  nowLabel: string;
  offerNow: boolean;
  help: string;
}) {
  const id = useId();
  const [value, setValue] = useState(initialValue);
  // What the server is known to hold, so an unchanged field never re-saves and
  // a refused one can be put back to the truth.
  const [savedValue, setSavedValue] = useState(initialValue);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  // The Log screen keys the day's subtree by date, but adopt a new day's value
  // if this is ever re-rendered without remounting: yesterday's time shown
  // against today would be a real value attached to the wrong fast.
  const [renderedFor, setRenderedFor] = useState(date);
  if (renderedFor !== date) {
    setRenderedFor(date);
    setValue(initialValue);
    setSavedValue(initialValue);
    setStatus("idle");
    setError(null);
  }

  const submit = useCallback(
    async (next: string) => {
      setStatus("saving");
      const result = await saveFastTimeAction({ date, edge, value: next });

      if (result.ok) {
        // Adopt what the server stored rather than what was typed — for "now"
        // they are different, and the server's answer is the real one.
        setValue(result.value);
        setSavedValue(result.value);
        setError(null);
        setStatus("saved");
        setTimeout(
          () => setStatus((current) => (current === "saved" ? "idle" : current)),
          SAVED_VISIBLE_MS,
        );
      } else {
        // Put the field back to what is really stored, so a refused time never
        // sits on screen looking saved.
        setValue(savedValue);
        setError(result.error);
        setStatus("error");
      }
    },
    [date, edge, savedValue],
  );

  const handleChange = (next: string) => {
    setValue(next);
    if (status === "error") setError(null);
    if (next === savedValue) return;
    void submit(next);
  };

  const describedBy = error ? `${id}-error` : `${id}-help`;

  return (
    <div className="field">
      <div className="autosave-label-row">
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
        <StatusChip status={status} />
      </div>

      <div className="flex items-center gap-2">
        <input
          id={id}
          type="time"
          className="field-input numeric"
          style={{ flex: "1 1 auto", minWidth: 0 }}
          value={value}
          disabled={disabled}
          onChange={(event) => handleChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />

        {offerNow && !disabled && (
          <button
            type="button"
            className="btn btn-tonal btn-sm"
            style={{ flex: "0 0 auto", whiteSpace: "nowrap" }}
            onClick={() => void submit("now")}
            disabled={status === "saving"}
          >
            {nowLabel}
          </button>
        )}
      </div>

      {error ? (
        <p id={`${id}-error`} className="field-error" role="alert">
          {error}
        </p>
      ) : (
        <p id={`${id}-help`} className="field-help">
          {help}
        </p>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: Status }) {
  return (
    <span className="autosave-status" role="status" aria-live="polite">
      {status === "saving" && <span className="autosave-saving">Saving…</span>}
      {status === "saved" && (
        <span className="autosave-saved">
          <span aria-hidden="true">✓</span> Saved
        </span>
      )}
      {status === "error" && <span className="autosave-error">Not saved</span>}
    </span>
  );
}
