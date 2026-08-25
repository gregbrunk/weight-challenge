"use client";

import { useActionState, useId, useState, useSyncExternalStore } from "react";
import { useFormStatus } from "react-dom";
import { setTimeZoneAction } from "@/actions/settings";
import { initialSettingsState } from "@/actions/settings-state";
import {
  COMMON_TIME_ZONES,
  timeInZone,
  todayInZone,
  zoneAbbreviation,
} from "@/lib/timezone";

interface Props {
  current: string;
  /** Every zone the runtime knows, passed from the server to keep both lists identical. */
  allZones: string[];
}

/**
 * Picks the timezone the whole app runs on.
 *
 * Shows the current time and date in whichever zone is selected — before you
 * save it. Picking a timezone from a list of four hundred identifiers is
 * otherwise guesswork, and getting it wrong silently misfiles entries by a day.
 */
export function TimezonePicker({ current, allZones }: Props) {
  const [state, formAction] = useActionState(setTimeZoneAction, initialSettingsState);
  const [selected, setSelected] = useState(current);
  const selectId = useId();

  const commonIds = new Set<string>(COMMON_TIME_ZONES.map((zone) => zone.id));
  const others = allZones.filter((zone) => !commonIds.has(zone));
  const dirty = selected !== current;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="field">
        <label className="field-label" htmlFor={selectId}>
          Timezone
        </label>

        <select
          id={selectId}
          name="timeZone"
          className="field-input"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          aria-describedby={`${selectId}-preview`}
        >
          <optgroup label="Common">
            {COMMON_TIME_ZONES.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="All time zones">
            {others.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replace(/_/g, " ")}
              </option>
            ))}
          </optgroup>
        </select>

        <ZonePreview id={`${selectId}-preview`} timeZone={selected} />
      </div>

      {state.message && (
        <p
          role="status"
          className={state.status === "error" ? "alert alert-danger" : "alert alert-success"}
        >
          <span aria-hidden="true" className="alert-icon">
            {state.status === "error" ? "⚠" : "✓"}
          </span>
          <span>{state.message}</span>
        </p>
      )}

      <SaveButton disabled={!dirty} />
    </form>
  );
}

/** How often the preview clock re-reads the time. */
const CLOCK_TICK_MS = 30_000;

function subscribeToClock(onChange: () => void): () => void {
  const timer = setInterval(onChange, CLOCK_TICK_MS);
  return () => clearInterval(timer);
}

/**
 * The current time, as an external store rather than an effect.
 *
 * The snapshot is a tick count rather than a `Date` because
 * `useSyncExternalStore` compares snapshots by identity — a fresh `Date` on
 * every read would loop forever. The server snapshot is null, which renders a
 * placeholder until hydration supplies the real clock, avoiding a mismatch
 * between the server's timestamp and the browser's.
 */
function useNow(): Date | null {
  const tick = useSyncExternalStore(
    subscribeToClock,
    () => Math.floor(Date.now() / CLOCK_TICK_MS),
    () => null,
  );

  return tick === null ? null : new Date(tick * CLOCK_TICK_MS);
}

/** Live clock for the selected zone, so you can confirm a pick before saving. */
function ZonePreview({ id, timeZone }: { id: string; timeZone: string }) {
  const now = useNow();

  if (!now) {
    return (
      <p id={id} className="field-help">
        &nbsp;
      </p>
    );
  }

  return (
    <p id={id} className="field-help">
      It&apos;s <strong className="numeric">{timeInZone(timeZone, now)}</strong>{" "}
      <span className="numeric">{zoneAbbreviation(timeZone, now)}</span> there —{" "}
      today is <span className="numeric">{todayInZone(timeZone, now)}</span>.
    </p>
  );
}

function SaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <div>
      <button
        type="submit"
        className="btn btn-primary"
        disabled={disabled || pending}
        aria-busy={pending}
      >
        {pending ? "Saving…" : "Save timezone"}
      </button>
    </div>
  );
}
