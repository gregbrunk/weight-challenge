/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyTheme,
  DEFAULT_THEME,
  isValidTheme,
  readStoredTheme,
  setStoredTheme,
  subscribeTheme,
  THEME_COLORS,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  THEMES,
} from "./theme";

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
  document.getElementById("theme-color-override")?.remove();
});

describe("isValidTheme", () => {
  it.each(THEMES)("accepts %s", (theme) => {
    expect(isValidTheme(theme)).toBe(true);
  });

  it.each([["Dark"], ["auto"], [""], [null], [undefined], [1]])(
    "rejects %o",
    (value) => {
      expect(isValidTheme(value)).toBe(false);
    },
  );
});

describe("readStoredTheme", () => {
  it("falls back to the default when nothing is stored", () => {
    expect(readStoredTheme()).toBe(DEFAULT_THEME);
  });

  it("falls back to the default rather than trusting a junk value", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "solarized");
    expect(readStoredTheme()).toBe(DEFAULT_THEME);
  });

  it("reads a stored preference", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    expect(readStoredTheme()).toBe("dark");
  });
});

describe("applyTheme", () => {
  it("sets data-theme for an explicit choice", () => {
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  /**
   * The third state is the attribute's *absence*: `tokens.css` writes its dark
   * rules as `:root:not([data-theme="light"])` inside a prefers-color-scheme
   * query, so removing the attribute is what hands the decision back to the
   * device. Leaving `data-theme="system"` behind would match neither branch.
   */
  it("removes data-theme entirely for system", () => {
    applyTheme("dark");
    applyTheme("system");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("adds an unscoped theme-color meta so the browser chrome follows", () => {
    applyTheme("dark");
    const meta = document.getElementById("theme-color-override") as HTMLMetaElement | null;
    expect(meta?.getAttribute("name")).toBe("theme-color");
    expect(meta?.content).toBe(THEME_COLORS.dark);
  });

  it("swaps rather than stacks the meta when the choice changes", () => {
    applyTheme("dark");
    applyTheme("light");
    expect(document.querySelectorAll("#theme-color-override")).toHaveLength(1);
    expect(document.querySelector<HTMLMetaElement>("#theme-color-override")?.content).toBe(
      THEME_COLORS.light,
    );
  });

  it("removes the meta for system, so Next's media-scoped tags win again", () => {
    applyTheme("dark");
    applyTheme("system");
    expect(document.getElementById("theme-color-override")).toBeNull();
  });
});

describe("setStoredTheme", () => {
  it("persists, applies, and notifies in one step", () => {
    let notified = 0;
    const unsubscribe = subscribeTheme(() => {
      notified += 1;
    });

    setStoredTheme("dark");

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(notified).toBe(1);

    unsubscribe();
    setStoredTheme("light");
    expect(notified).toBe(1);
  });
});

describe("THEME_INIT_SCRIPT", () => {
  /**
   * This runs before React exists, so a throw would block the first paint
   * rather than degrading. Everything it touches is inside a try/catch.
   */
  it("is wrapped so a storage failure cannot block rendering", () => {
    expect(THEME_INIT_SCRIPT).toContain("try{");
    expect(THEME_INIT_SCRIPT).toContain("catch(e){}");
  });

  it("reads the same key the rest of the module writes", () => {
    expect(THEME_INIT_SCRIPT).toContain(JSON.stringify(THEME_STORAGE_KEY));
  });

  it("applies a stored dark preference before paint", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    new Function(THEME_INIT_SCRIPT)();

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.querySelector<HTMLMetaElement>("#theme-color-override")?.content).toBe(
      THEME_COLORS.dark,
    );
  });

  it("leaves the attribute off for system, so the media query decides", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "system");
    new Function(THEME_INIT_SCRIPT)();

    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(document.getElementById("theme-color-override")).toBeNull();
  });

  it("ignores a junk stored value rather than setting it as an attribute", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "'; alert(1); //");
    new Function(THEME_INIT_SCRIPT)();

    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  /**
   * The script and the React store have to agree on every value, or the page
   * paints one theme and the radio group reports another.
   */
  it("agrees with applyTheme for every theme", () => {
    for (const theme of THEMES) {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
      delete document.documentElement.dataset.theme;
      document.getElementById("theme-color-override")?.remove();

      new Function(THEME_INIT_SCRIPT)();
      const fromScript = document.documentElement.dataset.theme;
      const metaFromScript =
        document.querySelector<HTMLMetaElement>("#theme-color-override")?.content;

      delete document.documentElement.dataset.theme;
      document.getElementById("theme-color-override")?.remove();

      applyTheme(theme);
      expect(document.documentElement.dataset.theme).toBe(fromScript);
      expect(document.querySelector<HTMLMetaElement>("#theme-color-override")?.content).toBe(
        metaFromScript,
      );
    }
  });
});
