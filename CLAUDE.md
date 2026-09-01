@AGENTS.md

# Weight Challenge — project context

A single-user, mobile-first web app for running a weight-loss plan. It replaces
a Numbers spreadsheet ("2026 Challenge") and reproduces its arithmetic exactly.
Greg is the only user; it lives on his phone's home screen and gets opened
twice a day.

Read `README.md` for setup and deploy steps. This file is the operational
knowledge that isn't obvious from the code.

## Architecture invariants

Break these and things go subtly wrong rather than loudly wrong.

- **`src/lib/calc.ts` is the single source of every derived number.** Targets,
  deficits, progress, projections. No screen computes its own. It is verified
  against the original spreadsheet's own figures in `calc.test.ts` — if those
  tests fail, the app no longer matches the sheet it replaced.
- **Missing values are gaps, never zeros.** In charts (`connectNulls={false}`),
  in averages, and on screen (em dash). A day with no weight is unlogged, not a
  day you weighed nothing. Every measurement column is nullable for this reason.
- **Dates are calendar days, not instants.** `src/lib/date.ts` uses
  `YYYY-MM-DD` strings pinned to UTC noon. Never `new Date()` arithmetic.
- **"Today" comes from the app's timezone setting**, not the server or the
  browser: `getToday()` in `src/lib/timezone-server.ts`. Defaults to
  `America/Denver`. The server runs in UTC and would be a day ahead in the
  evening.
- **Server-only modules import `"server-only"`.** Three separate bugs were a
  client component reaching a server module through a shared constant, each one
  passing build, lint and tests while a page was completely broken at runtime.
  If you add a module that touches the database or `node:` APIs, guard it, and
  put anything a client needs in a sibling module with no server imports
  (`password-rules.ts`, `photos/slots.ts`, `timezone.ts`).
- **Photos are served through `/api/photos/[id]`**, never by a storage URL, and
  Blob objects are stored with `access: "private"`. The password is the only
  lock on this app; serving photos directly would make it decorative.

## Deployment facts

- **Production:** the URL is `APP_PRODUCTION_URL` in `.env`, not written down
  here — this repo is public and a personal deployment shouldn't be advertised
  in it. `.env.example` documents the key. On Vercel the platform exposes the
  same value as `VERCEL_PROJECT_PRODUCTION_URL` at build and runtime, so
  nothing needs to hardcode it. Hosting is Vercel, auto-deploying from `main`
  on GitHub (`gregbrunk/weight-challenge`).

  To check a deploy has landed, poll something public that the commit actually
  changed — `/manifest.webmanifest` works and is served without a session.
  Probing an authenticated page for a string only visible after login reports a
  failure that never happened.
- **The database is shared between local development and production.** One Neon
  instance. Running `npm run db:migrate` locally applies to production, and
  local dev reads and writes Greg's real data. There is no separate dev
  database. Treat every write as production, and never run `db:reset` against it
  without asking.
- Storage is Vercel Blob (private, Portland). Local development falls back to
  writing into `.photos/` when `BLOB_READ_WRITE_TOKEN` is absent.

## Traps already discovered

Each of these cost real time. They are fixed, but they recur if you undo them.

- **`vercel env pull` writes the literal string `[SENSITIVE]`**, not values, for
  anything marked sensitive — which was all four variables that matter. Next
  loads `.env.local` *ahead of* `.env`, so a pulled file silently breaks local
  development. Don't keep one; `.env` has the real values.
- **`allowedDevOrigins` in `next.config.ts` is load-bearing.** Without it, Next
  403s its own dev assets when the app is reached as `127.0.0.1` instead of
  `localhost`. The page still server-renders, so it looks fine while nothing
  interactive works.
- **Recharts puts a `<Line>`'s `className` on the wrapping `<g>`, not the
  `<path>`.** The stylesheet reaches strokes with a descendant selector. Get it
  wrong and every chart silently renders in Recharts' default blue.
- **Client components on the Log screen seed state from props**, so the day's
  subtree is keyed by date. Remove that key and arrowing between days shows the
  previous day's numbers — real values attached to the wrong date.
- **The browser pane is unreliable with localhost.** It intermittently refuses
  to navigate and occasionally times out on clicks. Driving forms from page
  context (`javascript_tool`) is reliable; `browser_batch` avoids round trips. A
  full teardown — close tabs, stop every preview server, kill the port, restart
  — sometimes clears it.
- **The `getcwd` syscall is sometimes denied in the sandbox**, which breaks npm,
  npx and git entirely. Workarounds: run node from the scratchpad with absolute
  paths, and git via `--git-dir`/`--work-tree` from outside the repo.

## Working agreements

- **A green build is not evidence the app works.** Build, typecheck, lint and
  the full suite all passed while the Settings page threw on load and the charts
  rendered in the wrong colour. Verify in a browser, or with a rendering test if
  the browser is unavailable.
- Pure logic goes in `src/lib` with tests; the tests are the spec.
- Node lives at `~/.local/node` (no Homebrew on this machine).
- Commit messages explain *why*, not what — they are the design record.

## User preferences

- Sage green accent, not the design system's fuchsia. Contrast values in
  `src/app/tokens.css` are measured, not eyeballed; re-measure if you change one.
- Mountain Time.
