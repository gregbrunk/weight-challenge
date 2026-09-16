"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A small preference remembered in `localStorage`.
 *
 * Reading storage during render would disagree with what the server rendered,
 * and reading it in an effect means a setState the moment the component mounts.
 * `useSyncExternalStore` is the shape React asks for instead: the server
 * snapshot is the fallback, the client snapshot is whatever is stored, and
 * hydration reconciles the two without a cascading render.
 *
 * Storage can throw or come back empty — private browsing, site data cleared,
 * storage switched off — so every path falls back rather than failing. Losing a
 * display preference is not worth an error boundary.
 */

/** Same-tab writers, since the `storage` event only fires for *other* tabs. */
const listeners = new Map<string, Set<() => void>>();

function notify(key: string): void {
  for (const listener of listeners.get(key) ?? []) listener();
}

export function useStoredPreference<T extends string>(
  key: string,
  fallback: T,
  isValid: (value: string) => value is T,
): [T, (next: T) => void] {
  const subscribe = useCallback(
    (onChange: () => void) => {
      let forKey = listeners.get(key);
      if (!forKey) {
        forKey = new Set();
        listeners.set(key, forKey);
      }
      forKey.add(onChange);
      window.addEventListener("storage", onChange);

      return () => {
        forKey.delete(onChange);
        window.removeEventListener("storage", onChange);
      };
    },
    [key],
  );

  // Returns a string, so repeated calls compare equal and can't loop.
  const getSnapshot = useCallback((): T => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored !== null && isValid(stored) ? stored : fallback;
    } catch {
      return fallback;
    }
  }, [key, fallback, isValid]);

  const getServerSnapshot = useCallback((): T => fallback, [fallback]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const set = useCallback(
    (next: T) => {
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // Not remembering it is fine; the choice still applies to this view.
      }
      notify(key);
    },
    [key],
  );

  return [value, set];
}
