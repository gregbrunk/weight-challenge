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
- **Missing values are gaps, never zeros.** In averages, in exports, and on
  screen (em dash). A day with no weight is unlogged, not a day you weighed
  nothing. Every measurement column is nullable for this reason.

  Charts are the one place the *drawing* bridges a gap: `connectNulls` is on,
  because blood pressure and VO2 max are measured every few days at most and a
  line broken at every unmeasured day is mostly gaps. The data is untouched —
  the day is still null, the tooltip still shows an em dash for it. Greg asked
  for this deliberately (Sep 2026); don't "fix" it back to `false`.
- **Dates are calendar days, not instants.** `src/lib/date.ts` uses
  `YYYY-MM-DD` strings pinned to UTC noon. Never `new Date()` arithmetic.

  Fast start and end times are the one exception, and a deliberate one: they
  are real instants (`@db.Timestamptz`), because a fast spanning a
  daylight-saving change lasted the hours it lasted, not the hours the wall
  clock claims — 6:30pm to 12:30pm across a spring-forward is seventeen, not
  eighteen. Convert between instants and wall-clock times only through
  `instantFromZonedTime` / `zonedMinutesOf` in `timezone.ts`, which pick
  deliberately on the two days a year when a local time is skipped or repeated.
- **A fast belongs to the day it ends.** `DailyEntry` carries two halves of two
  *different* fasts: `fastStartAt` is the one beginning that evening,
  `fastEndAt` the one finishing that morning. A whole fast is day D−1's start
  paired with day D's end, credited to D. `fastForDay` in `src/lib/fasting.ts`
  is the only place that pairing happens — never re-derive it at a call site.

  Two consequences that look like bugs: a plan's **first day is creditable only
  if `Plan.preStartFastAt` is set** — the evening before the plan began, which
  has no row to live on because its day precedes the plan — and otherwise drops
  out of every denominator rather than standing as a day that could never be
  won; and a fast is **only judged once closed** — nineteen hours into an
  eighteen-hour goal is not a success, because you may have eaten at eleven and
  not said so yet. That is why the end time is editable and not just a button.

  `firstCreditableDate` and `creditableDayCount` are the single answer to "does
  day one count", and **everything that counts days must ask them**, including
  `taskWindow` in `streaks.ts`. It didn't at first, so a fasting habit marked
  day one eligible and never satisfiable: a flawless record read 2 of 3, the
  streak broke on day one, and the card contradicted Progress, which already
  knew better. Covered now in `streaks.test.ts`.
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

  To check a deploy has landed, read Vercel's status for the commit from
  GitHub — the repo is public, so no token is needed:

      curl -s https://api.github.com/repos/gregbrunk/weight-challenge/commits/<sha>/status

  `state: success` with the Vercel context means it is live. Two probes that
  looked reasonable and were wrong: polling an authenticated page for a string
  only visible after login (reports failure forever), and watching a `_next`
  chunk hash on the unlock page for a change (chunks are content-hashed, so a
  commit that doesn't touch that chunk leaves the name identical — reports
  failure forever too). Polling `/manifest.webmanifest` works only when the
  commit changed it.
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

  It is not uniform, so check rather than assume: a `<Cell>`'s class lands on
  the `<path>` itself (`path.fasting-bar-met`), while a `<ReferenceLine>`'s
  lands on a wrapping `<g>` (`.fasting-goal-line line`). Both are asserted in
  `fasting-week-chart.test.tsx` against the real rendered SVG.
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

- The design system is Material (the `material-ui` skill), violet primary. The
  earlier sage-green preference applied to the previous system and is retired.
  Contrast values in `src/app/tokens.css` are measured, not eyeballed;
  `npm run check:contrast` re-measures every pair — run it after changing one.
- Mountain Time.
