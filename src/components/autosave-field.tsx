"use client";

import { useCallback, useId, useRef, useState } from "react";
import { saveEntryFieldAction } from "@/actions/entry";
import type { EntryFieldName } from "@/lib/validation";
import type { PlainDate } from "@/lib/date";

type Status = "idle" | "saving" | "saved" | "error";

/** How long after the last keystroke to save without waiting for a blur. */
const DEBOUNCE_MS = 900;

/** How long "Saved" stays up before the field goes quiet again. */
const SAVED_VISIBLE_MS = 2200;

interface Props {
  date: PlainDate;
  field: EntryFieldName;
  label: string;
  initialValue: string;
  unit?: string;
  help?: string;
  step?: string;
  decimal?: boolean;
  placeholder?: string;
}

/**
 * A numeric field that saves itself.
 *
 * There is no submit button on the Log screen by design: you open it at seven
 * in the morning with a weight, and again at ten at night with calories, and
 * anything you type has to survive closing the tab in between. Each field owns
 * its own value, its own save and its own status, and writes only its own
 * column — so the evening's entry can never overwrite the morning's.
 *
 * Saving happens on blur, and also 900ms after you stop typing, because on a
 * phone "blur" often means the browser was closed.
 */
export function AutosaveField({
  date,
  field,
  label,
  initialValue,
  unit,
  help,
  step,
  decimal = false,
  placeholder,
}: Props) {
  const id = useId();
  const [value, setValue] = useState(initialValue);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);


  // What the server currently holds, so an unchanged field never re-saves.
  // State rather than a ref because the date guard below has to reset it during
  // render, and mutating a ref there is unsafe under concurrent rendering.
  const [savedValue, setSavedValue] = useState(initialValue);

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFlash = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against an earlier, slower save landing after a later one.
  const saveSequence = useRef(0);

  // Belt and braces alongside the date key on the Log screen: if this field is
  // ever re-rendered for a different day without being remounted, adopt that
  // day's value instead of showing the previous one. React's documented way to
  // reset state from props — during render, no effect involved.
  const [renderedFor, setRenderedFor] = useState(date);
  if (renderedFor !== date) {
    setRenderedFor(date);
    setValue(initialValue);
    setStatus("idle");
    setError(null);
    setSavedValue(initialValue);
  }

  const save = useCallback(
    async (next: string) => {
      if (debounce.current) clearTimeout(debounce.current);
      if (next.trim() === savedValue.trim()) return;

      const sequence = ++saveSequence.current;
      setStatus("saving");

      const result = await saveEntryFieldAction({ date, field, value: next.trim() });

      // A newer save has already started; its result is the one that counts.
      if (sequence !== saveSequence.current) return;

      if (result.ok) {
        setSavedValue(next.trim());
        setError(null);
        setStatus("saved");

        if (savedFlash.current) clearTimeout(savedFlash.current);
        savedFlash.current = setTimeout(() => {
          // Only go quiet if nothing has changed since.
          setStatus((current) => (current === "saved" ? "idle" : current));
        }, SAVED_VISIBLE_MS);
      } else {
        setError(result.error);
        setStatus("error");
      }
    },
    [date, field, savedValue],
  );

  const handleChange = (next: string) => {
    setValue(next);
    if (status === "error") setError(null);

    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void save(next), DEBOUNCE_MS);
  };

  const describedBy = error ? `${id}-error` : help ? `${id}-help` : undefined;

  return (
    <div className="field">
      <div className="autosave-label-row">
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
        <StatusChip status={status} />
      </div>

      <div className="relative">
        <input
          id={id}
          name={field}
          type="number"
          inputMode={decimal ? "decimal" : "numeric"}
          className="field-input numeric"
          style={unit ? { paddingRight: "calc(var(--space-md) * 3)" } : undefined}
          value={value}
          onChange={(event) => handleChange(event.target.value)}
          onBlur={() => void save(value)}
          step={step}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
        {unit && (
          <span className="field-suffix numeric" aria-hidden="true">
            {unit}
          </span>
        )}
      </div>

      {error ? (
        <p id={`${id}-error`} className="field-error" role="alert">
          {error}
        </p>
      ) : help ? (
        <p id={`${id}-help`} className="field-help">
          {help}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Save state, announced politely so a screen reader hears it without being
 * interrupted mid-word while typing.
 */
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
