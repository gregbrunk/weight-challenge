"use client";

import { useId, useSyncExternalStore } from "react";
import {
  getServerTheme,
  readStoredTheme,
  setStoredTheme,
  subscribeTheme,
  THEME_LABELS,
  THEMES,
  type Theme,
} from "@/lib/theme";

/**
 * Chooses light, dark, or whatever the device is set to.
 *
 * Real radio inputs rather than buttons with click handlers: a single choice
 * from a small set is what radios are, and they arrive with arrow-key
 * navigation, one tab stop for the group, and the right announcement already
 * built in.
 *
 * The preference is applied the instant it changes — there is no Save button,
 * because the result of the change *is* the feedback.
 *
 * It is read through `useSyncExternalStore` because it lives in localStorage,
 * outside React, and can be changed from another tab. The server and the
 * hydrating client both see "system"; the real value arrives immediately
 * after. The page itself is already showing the right theme by then — the
 * inline script in <head> saw to that before paint — so this only settles
 * which radio is filled in.
 */
export function ThemePicker() {
  const theme = useSyncExternalStore<Theme>(subscribeTheme, readStoredTheme, getServerTheme);
  const groupId = useId();

  return (
    <fieldset className="segmented-field">
      <legend className="sr-only">Appearance</legend>

      <div className="segmented">
        {THEMES.map((option) => {
          const id = `${groupId}-${option}`;
          return (
            <div key={option} className="segmented-option">
              <input
                type="radio"
                id={id}
                name={`${groupId}-theme`}
                className="sr-only segmented-input"
                value={option}
                checked={theme === option}
                onChange={() => setStoredTheme(option)}
              />
              <label htmlFor={id} className="segmented-label">
                {THEME_LABELS[option]}
              </label>
            </div>
          );
        })}
      </div>

      <p className="text-muted" style={{ fontSize: "var(--text-body-md)" }}>
        {theme === "system"
          ? "Following the device's appearance setting."
          : `Always ${THEME_LABELS[theme].toLowerCase()}, whatever the device is set to.`}
      </p>
    </fieldset>
  );
}
