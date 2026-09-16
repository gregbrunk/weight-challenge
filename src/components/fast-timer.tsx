"use client";

import { useEffect, useState } from "react";
import { formatClock, formatDuration } from "@/lib/format";
import { useStoredPreference } from "@/lib/stored-preference";
import type { FastStatus } from "@/lib/fasting";

const RADIUS = 104;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const MS_PER_HOUR = 3_600_000;

/** Remembered across visits, since it's a reading preference, not data. */
const MODE_KEY = "weight-challenge:fast-timer-mode";

type Mode = "up" | "down";

function isMode(value: string): value is Mode {
  return value === "up" || value === "down";
}

export interface FastTimerProps {
  status: FastStatus;
  /** Epoch milliseconds, so nothing has to serialise a Date across the boundary. */
  startAtMs: number | null;
  endAtMs: number | null;
  goalHours: number;
  met: boolean;
  /** The server's clock at render, used until the browser takes over ticking. */
  nowMs: number;
  /**
   * Whether this is the real today. A fast still open on a past day was never
   * ended, which is a miss — not something to keep counting.
   */
  isToday: boolean;
  startedLabel: string | null;
  goalEndLabel: string | null;
  endedLabel: string | null;
}

/**
 * The day's fast, as a ring.
 *
 * Which fast? The one *ending* today — begun yesterday evening. The fast that
 * starts tonight has no timer here; it gets one tomorrow, on the day it will be
 * credited to. Showing both would put two rings on the screen racing each
 * other, only one of which counts for today.
 *
 * Count-up and count-down are the same number read from opposite ends, and the
 * toggle changes nothing underneath. Past the goal the countdown has nothing
 * left to count, so both modes show the overage — a timer sitting at zero while
 * you are still fasting would be the one moment it stops telling the truth.
 */
export function FastTimer({
  status,
  startAtMs,
  endAtMs,
  goalHours,
  met,
  nowMs,
  isToday,
  startedLabel,
  goalEndLabel,
  endedLabel,
}: FastTimerProps) {
  // Seeded from the server's clock so the first paint matches the markup sent,
  // then handed over to the browser's own clock a second later.
  const [now, setNow] = useState(nowMs);
  const [mode, chooseMode] = useStoredPreference<Mode>(MODE_KEY, "up", isMode);

  const running = status === "running" && isToday;

  useEffect(() => {
    if (!running) return;

    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const goalMs = goalHours * MS_PER_HOUR;

  if (status === "none" || startAtMs === null) {
    return (
      <EmptyRing
        headline="No fast to end today"
        detail={
          isToday
            ? "Log last night's last meal and this ring starts counting."
            : "Nothing was started the day before, so no fast was credited here."
        }
      />
    );
  }

  // Closed: a final verdict, and the ring stops being a clock.
  if (status === "complete" && endAtMs !== null) {
    const hours = (endAtMs - startAtMs) / MS_PER_HOUR;

    return (
      <Ring
        fraction={Math.min(hours / goalHours, 1)}
        tone={met ? "success" : "danger"}
        label={`Fast ${met ? "complete" : "ended short"}: ${formatDuration(hours)}`}
      >
        <Verdict met={met} />
        <p className="fast-timer-value">{formatDuration(hours)}</p>
        <p className="fast-timer-caption">
          {met ? `Goal was ${goalHours}h` : `${goalHours}h goal missed`}
        </p>
      </Ring>
    );
  }

  // Open, but on a day that has already passed: never ended, so never met.
  if (!isToday) {
    return (
      <Ring fraction={1} tone="danger" label="Fast never ended">
        <Verdict met={false} />
        <p className="fast-timer-value">Not ended</p>
        <p className="fast-timer-caption">No first meal was logged that day</p>
      </Ring>
    );
  }

  const elapsedMs = now - startAtMs;
  const remainingMs = goalMs - elapsedMs;
  const pastGoal = remainingMs <= 0;
  const fraction = Math.min(Math.max(elapsedMs / goalMs, 0), 1);
  const percent = Math.round(Math.min(elapsedMs / goalMs, 1) * 100);

  return (
    <div className="flex flex-col" style={{ gap: "var(--space-md)" }}>
      <Ring
        fraction={fraction}
        tone={pastGoal ? "success" : "primary"}
        label={`Fasting: ${formatClock(elapsedMs)} of ${goalHours}h`}
      >
        {pastGoal ? (
          <>
            <p className="fast-timer-label">Past your goal</p>
            <p className="fast-timer-value">+{formatClock(-remainingMs)}</p>
            <p className="fast-timer-caption">
              Reached {goalHours}h{goalEndLabel ? ` at ${goalEndLabel}` : ""} — still fasting
            </p>
          </>
        ) : mode === "up" ? (
          <>
            <p className="fast-timer-label">Elapsed ({percent}%)</p>
            <p className="fast-timer-value">{formatClock(elapsedMs)}</p>
            <p className="fast-timer-caption">
              Remaining {formatClock(remainingMs)}
            </p>
          </>
        ) : (
          <>
            <p className="fast-timer-label">Remaining ({100 - percent}%)</p>
            <p className="fast-timer-value">{formatClock(remainingMs)}</p>
            <p className="fast-timer-caption">Elapsed {formatClock(elapsedMs)}</p>
          </>
        )}
      </Ring>

      {/* Hidden from the timer's own live updates: a screen reader being told
          the time every second would be unusable. */}
      <p className="sr-only" role="status">
        {pastGoal
          ? `Past your ${goalHours} hour goal and still fasting.`
          : `${formatDuration(elapsedMs / MS_PER_HOUR)} into a ${goalHours} hour fast.`}
      </p>

      {!pastGoal && (
        <div className="fast-timer-modes" role="group" aria-label="Timer display">
          <ModeButton current={mode} value="up" onSelect={chooseMode}>
            Count up
          </ModeButton>
          <ModeButton current={mode} value="down" onSelect={chooseMode}>
            Count down
          </ModeButton>
        </div>
      )}

      <dl className="fast-timer-ends">
        <FastEnd label="Started fasting" value={startedLabel} />
        <FastEnd
          label={endedLabel ? "First meal" : "Goal reached at"}
          value={endedLabel ?? goalEndLabel}
        />
      </dl>
    </div>
  );
}

function Ring({
  fraction,
  tone,
  label,
  children,
}: {
  fraction: number;
  tone: "primary" | "success" | "danger";
  label: string;
  children: React.ReactNode;
}) {
  const offset = CIRCUMFERENCE * (1 - Math.min(Math.max(fraction, 0), 1));

  return (
    <div className="fast-timer">
      <svg viewBox="0 0 240 240" className="fast-timer-ring" role="img" aria-label={label}>
        <circle className="fast-timer-track" cx="120" cy="120" r={RADIUS} />
        <circle
          className="fast-timer-progress"
          data-tone={tone}
          cx="120"
          cy="120"
          r={RADIUS}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="fast-timer-face">{children}</div>
    </div>
  );
}

function EmptyRing({ headline, detail }: { headline: string; detail: string }) {
  return (
    <Ring fraction={0} tone="primary" label={headline}>
      <p className="fast-timer-value fast-timer-value-quiet">{headline}</p>
      <p className="fast-timer-caption">{detail}</p>
    </Ring>
  );
}

/** The tick or the cross that replaces the numbers once a fast is judged. */
function Verdict({ met }: { met: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="fast-timer-verdict"
      data-tone={met ? "success" : "danger"}
      aria-hidden="true"
    >
      {met ? (
        <path d="M4 12.5 9.5 18 20 6.5" />
      ) : (
        <>
          <path d="M6 6l12 12" />
          <path d="M18 6L6 18" />
        </>
      )}
    </svg>
  );
}

function ModeButton({
  current,
  value,
  onSelect,
  children,
}: {
  current: Mode;
  value: Mode;
  onSelect: (mode: Mode) => void;
  children: React.ReactNode;
}) {
  const active = current === value;

  return (
    <button
      type="button"
      className="fast-timer-mode"
      data-active={active || undefined}
      aria-pressed={active}
      onClick={() => onSelect(value)}
    >
      {children}
    </button>
  );
}

function FastEnd({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="label-caps">{label}</dt>
      <dd className="fast-timer-end-value">{value ?? "—"}</dd>
    </div>
  );
}
