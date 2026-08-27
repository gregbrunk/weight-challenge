"use client";

import { useLayoutEffect } from "react";
import { applyTheme, readStoredTheme } from "@/lib/theme";

/**
 * Re-applies the stored theme after React's development remount.
 *
 * The inline script in <head> sets `data-theme` during parsing, which is all a
 * production build needs. In development, Strict Mode remounts once and resets
 * <html> to only the attributes it manages from JSX — clearing the one the
 * script set, so every page but Settings would lose the preference.
 *
 * `useLayoutEffect` rather than `useEffect` because it runs before paint: the
 * point is that nobody ever sees the wrong theme.
 */
export function ThemeSync() {
  useLayoutEffect(() => {
    applyTheme(readStoredTheme());
  }, []);

  return null;
}
