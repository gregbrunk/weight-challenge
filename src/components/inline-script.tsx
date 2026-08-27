/**
 * An inline script that runs while the browser parses the HTML.
 *
 * The type flips to `text/plain` on the client so the browser ignores it after
 * hydration — React warns in development when a render produces a `<script>`
 * tag, and a script inserted by a DOM update would never execute anyway.
 * `suppressHydrationWarning` covers the resulting type mismatch.
 *
 * See node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
