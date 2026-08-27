/**
 * Light/dark preference.
 *
 * Client-safe by construction: no database, no `node:` APIs, no `server-only`.
 * The theme picker is a client component, and this is the module it reaches
 * for — the same split as `timezone.ts` beside `timezone-server.ts`, for the
 * same reason.
 *
 * The preference lives in `localStorage` rather than in the settings row. It is
 * genuinely per-device — the phone on the nightstand wants dark at the times
 * the laptop does not — and it is cosmetic, which is not worth a migration
 * against a database shared with production.
 */

export const THEMES = ["system", "light", "dark"] as const;

export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = "system";

export const THEME_STORAGE_KEY = "weight-challenge-theme";

export function isValidTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

export const THEME_LABELS: Record<Theme, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

/** The colour the browser chrome should take, matching `tokens.css`. */
export const THEME_COLORS = { light: "#f7f6fd", dark: "#14121c" } as const;

/**
 * Reads the stored preference. Returns the default when storage is
 * unavailable — a private window, or a browser refusing site data — rather
 * than throwing on a cosmetic setting.
 */
export function readStoredTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isValidTheme(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/**
 * Puts the preference on the document and keeps the chrome colour in step.
 *
 * `system` removes the attribute entirely, which hands the decision back to
 * the `prefers-color-scheme` rules in `tokens.css`. Those are written as
 * `:root:not([data-theme="light"])`, so an explicit choice wins in both
 * directions and the attribute's absence is the third state.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;

  if (theme === "system") {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = theme;
  }

  // Next renders two media-scoped theme-color tags. Neither can express "dark
  // while the OS is light", so an explicit choice needs an unscoped tag that
  // outranks them, and clearing the choice has to remove it again.
  const id = "theme-color-override";
  document.getElementById(id)?.remove();

  if (theme !== "system") {
    const meta = document.createElement("meta");
    meta.id = id;
    meta.name = "theme-color";
    meta.content = THEME_COLORS[theme];
    document.head.appendChild(meta);
  }
}

/* --------------------------------------------------------------------------
   Store plumbing for useSyncExternalStore

   The preference lives outside React, in localStorage, and can be changed from
   another tab. Reading it through an external store rather than an effect is
   what lets the server render "system", the client correct it during
   hydration, and a change in another window arrive here — without any of the
   three fighting each other.
   -------------------------------------------------------------------------- */

const themeListeners = new Set<() => void>();

/** Subscribes to preference changes, from this tab or any other. */
export function subscribeTheme(onChange: () => void): () => void {
  themeListeners.add(onChange);

  function onStorage(event: StorageEvent) {
    if (event.key !== THEME_STORAGE_KEY) return;
    // Another tab changed it, so this document has to follow, not just re-render.
    applyTheme(readStoredTheme());
    onChange();
  }

  window.addEventListener("storage", onStorage);
  return () => {
    themeListeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** What the server and the hydrating client both start from. */
export function getServerTheme(): Theme {
  return DEFAULT_THEME;
}

/** Stores the preference, applies it, and tells every subscriber. */
export function setStoredTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage can be unavailable in a private window or with site data
    // blocked. The choice still applies to this page; it just won't outlive
    // it, which is better than failing the interaction outright.
  }
  applyTheme(theme);
  for (const listener of themeListeners) listener();
}

/**
 * The pre-paint script, inlined into <head>.
 *
 * It has to run before the first paint or the app flashes the system theme
 * before correcting itself, which on a phone opened in a dark room is the
 * whole screen going white for a frame. Deliberately tiny and defensive: any
 * throw here would block rendering, so everything is wrapped.
 */
export const THEME_INIT_SCRIPT = `(function(){try{
var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
if(t==="light"||t==="dark"){
document.documentElement.dataset.theme=t;
var m=document.createElement("meta");
m.id="theme-color-override";m.name="theme-color";
m.content=t==="dark"?${JSON.stringify(THEME_COLORS.dark)}:${JSON.stringify(THEME_COLORS.light)};
document.head.appendChild(m);}
}catch(e){}})();`;
