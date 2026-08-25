"use client";

import { useId } from "react";

interface Props {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  /** Unit shown inside the field's right edge, e.g. "lb", "cal", "%". */
  unit?: string;
  help?: string;
  error?: string;
  step?: string;
  min?: number;
  max?: number;
  placeholder?: string;
  required?: boolean;
  /** Whole numbers get the numeric keypad; decimals get the decimal pad. */
  decimal?: boolean;
}

/**
 * A labelled numeric input.
 *
 * `inputMode` matters more than it looks: it decides which keypad iOS raises,
 * and this app is mostly typing numbers on a phone. The 16px font size in
 * `.field-input` is what stops Safari zooming the page on focus.
 */
export function NumberField({
  label,
  name,
  value,
  onChange,
  unit,
  help,
  error,
  step,
  min,
  max,
  placeholder,
  required,
  decimal = false,
}: Props) {
  const id = useId();
  const describedBy = error ? `${id}-error` : help ? `${id}-help` : undefined;

  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
        {!required && (
          <span className="text-muted" style={{ fontWeight: "var(--weight-regular)" }}>
            {" "}
            (optional)
          </span>
        )}
      </label>

      <div className="relative">
        <input
          id={id}
          name={name}
          type="number"
          inputMode={decimal ? "decimal" : "numeric"}
          className="field-input numeric"
          style={unit ? { paddingRight: "calc(var(--space-md) * 3)" } : undefined}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          step={step}
          min={min}
          max={max}
          placeholder={placeholder}
          required={required}
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
        <p id={`${id}-error`} className="field-error">
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
