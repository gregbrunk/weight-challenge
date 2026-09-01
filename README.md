# Weight Challenge

An app designed to let you lose a specified amount of weight in a specified amount of time. Set a plan, log measurements as they come in throughout the day, and watch the calorie deficit burn down against the pace needed to finish on target.

A mobile-first web app for running a math-based weight-loss plan, based on a spreadsheet I made many years ago. The app is for a single user with a single password, and has no account system. It is equipped with brute-force prevention.

## What it does

- **Plan** — set the goal, the timeline and your baseline; every target in the
  app is derived from five numbers, recalculated live as you type.
- **Log** — weight and body fat in the morning, calories and blood pressure at
  night. Every field saves itself; nothing needs finishing in one sitting.
  Optional progress photos, three angles a day.
- **Today** — the day's deficit against what it needed to be, calories against
  their ceiling and floor, and each measurement's movement since baseline.
- **Progress** — the deficit burndown, pace and projection, current-versus-best
  statistics, four charts, and the photo timeline.
- **Settings** — timezone, password, and a CSV export of everything.

## Running it locally

Requires Node 20 or newer.

```bash
npm install
cp .env.example .env      # then fill in the values, see below
npm run db:migrate        # creates the schema
npm run dev
```

Then open <http://localhost:3000>. The first visit asks you to set a password.

### Environment

| Variable | Needed for | Notes |
| --- | --- | --- |
| `DATABASE_URL` | everything | Neon **pooled** connection string — the host with `-pooler` in it |
| `DIRECT_URL` | migrations only | The same host *without* `-pooler`; schema changes need a real session |
| `SESSION_SECRET` | sessions | Any random 32+ character string. Changing it logs you out |
| `BLOB_READ_WRITE_TOKEN` | progress photos in production | Optional locally — see below |

Generate a session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### Photo storage

Photos go through a driver interface with two implementations, chosen by
whether `BLOB_READ_WRITE_TOKEN` is set:

- **unset** — photos are written to `.photos/` on disk. No account, no token,
  and the directory is gitignored. This is the local default.
- **set** — photos go to Vercel Blob with `access: "private"`, so they are not
  reachable by URL at all.

Either way they are served through `/api/photos/[id]`, which checks the session
on every request. Photos are never served from a storage URL — that would make
the password decorative for the most private content in the app.

## Deploying to Vercel

The app is built for Vercel's free tier. Nothing here has been run against a
real deployment yet, so treat the Blob step as untested.

1. **Push to GitHub.** Vercel deploys from a repository.
2. **Import the project** at [vercel.com/new](https://vercel.com/new). The
   framework is detected automatically; the build command already runs
   `prisma generate`.
3. **Create a Blob store** — in the project, Storage → Create → Blob. Vercel
   sets `BLOB_READ_WRITE_TOKEN` on the project for you.
4. **Add the remaining environment variables** to the project: `DATABASE_URL`,
   `DIRECT_URL` and `SESSION_SECRET`. Use the same Neon database as local, or a
   separate one if you'd rather keep them apart.
5. **Deploy.** Migrations are not run automatically; apply them from your
   machine with `npm run db:migrate` pointed at the production `DIRECT_URL`.
6. **Add it to your home screen.** Open the deployment in Safari, Share → Add to
   Home Screen. The manifest declares `display: standalone`, so it launches
   without browser chrome.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build (runs `prisma generate` first) |
| `npm test` | The full test suite |
| `npm run db:migrate` | Create and apply a migration |
| `npm run db:check` | Verify the database connection and show what's stored |
| `npm run db:reset -- --yes` | Delete every plan, entry and photo; clear the password |
| `npm run icons` | Re-render the app icons from `scripts/generate-icons.mjs` |

## How it's put together

`src/lib/calc.ts` is the centre of it. Every derived number in the app comes
from that one file, so no two screens can disagree, and it is verified against
the original spreadsheet's own figures in `calc.test.ts`.

Three deliberate departures from that spreadsheet:

1. **Personal bests scan the whole plan.** The sheet hardcoded row 40, so
   anything logged after 1 October silently stopped counting.
2. **Baselines come from the plan**, not the first row of the log, so a missed
   day-one weigh-in doesn't break every statistic.
3. **Missing values are gaps, never zeros** — in charts, in averages, and on
   screen, where they render as an em dash.

The energy model is carried over unchanged: TDEE is RMR plus active calories,
with no allowance for NEAT or the thermic effect of food. That is deliberately
conservative.

## Security

- One password, hashed with scrypt. There is no reset and no recovery: forget
  it and the data is unreachable.
- Sessions are signed JWTs in HTTP-only cookies, expiring after 15 minutes of
  inactivity and sliding forward while you use the app.
- Changing the password bumps a session epoch, invalidating every outstanding
  session on every device.
- Every route and every API endpoint is behind the session, including photo
  delivery and the CSV export.
