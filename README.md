# Presently

## Attendance, without the mental arithmetic.

Presently is an attendance tracker for anyone who wants a straight answer before deciding to skip a class.

Open it. Mark what happened. See exactly where you stand.

**Live:** [presently-beta.vercel.app](https://presently-beta.vercel.app)

<br />

## The number that actually matters

Most trackers stop at a percentage. Presently goes one step further and tells you, per subject, one of two things:

- **You can miss N more classes** and stay on target.
- **Attend your next N classes** to get back on target.

That is the whole product. Less arithmetic, less second-guessing.

## What it does

- A daily check-in listing every class scheduled for today
- Four states per session: Present, Absent, Cancelled, Holiday
- A calendar for backfilling or correcting any past day
- Per-subject targets, timetables, history, archive and delete
- Weighted overall attendance — pooled across classes, never an average of averages
- Email sign-in by magic link or password
- CSV export, installable as an app
- Works offline: changes are queued on the device and sent when you reconnect

## Open source

Released under the [MIT License](LICENSE). Use it, change it, ship it, sell it — just keep the licence notice.

## Run it locally

Requires Node.js 22 or newer.

```bash
git clone https://github.com/nabrahma/Presently.git
cd Presently
npm install
npm run dev
```

Vite prints a local URL, normally `http://localhost:5173`.

Without Supabase credentials the app runs in local-only mode: everything works, and data stays in the browser. That is the fastest way to try a change.

## Connect Supabase

Copy the example environment file and fill it in:

```bash
cp .env.example .env.local
```

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-key
```

Only the publishable/anon key belongs in the browser. Never commit a service-role key, database password, or personal access token.

Apply the schema to a fresh project:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push --dry-run
npx supabase db push
```

Then, under **Authentication → URL Configuration**, set your deployed URL as both the Site URL and an allowed redirect URL, and add `http://localhost:5173` for local development. Magic links will not return to the app without this.

Migrations live in [supabase/migrations/](supabase/migrations/): the [initial schema](supabase/migrations/20260728_initial_schema.sql), then [constraints, triggers and indexes](supabase/migrations/20260729_harden_schema.sql).

## The maths

Only Present and Absent count. Cancelled and Holiday are deliberately excluded — they were never a chance to attend.

```text
percentage = round(P / (P + A) × 100, 1)
bunkable   = floor((P × 100 − target × T) / target)        where T = P + A
comeback   = ceil((target × T − P × 100) / (100 − target))
```

Both formulas are evaluated in integer space rather than with a fractional target. In floating point, `0.75 × 20` is `14.999999999999998`, which turns an exactly-on-target record into an off-by-one — a real difference when the answer is "you can miss one more".

The implementation is in [src/lib/attendanceMath.ts](src/lib/attendanceMath.ts) and is tested against the worked examples plus exhaustive sweeps that assert each answer is both correct and minimal.

## Architecture

| Layer | Choice |
| --- | --- |
| Application | React 19, TypeScript, Vite |
| Styling | Tailwind CSS v4, with the palette defined once as CSS custom properties |
| Type | Geist and Geist Mono, self-hosted |
| Motion | Motion, for transitions and the sliding dock indicator |
| Sheets | Vaul, for drag-to-dismiss drawers |
| Icons | Lucide |
| Auth and data | Supabase Auth, Postgres, Row Level Security |
| Offline and install | Workbox via vite-plugin-pwa |
| Hosting | Vercel |

```text
src/
  App.tsx              routes, access control, code splitting
  components/          shell, drawer, forms, gauges, data rows
  screens/             one file per route
  lib/
    attendanceMath.ts  pure, tested attendance calculations
    date.ts            local-calendar date keys
    schedule.ts        timetable expansion for a given day
    csv.ts             export and escaping
    store.tsx          state, sync, and the offline outbox
supabase/migrations/   versioned database schema
```

### How it is meant to feel

Presently is installed and opened for a few seconds a day, so it is built as an
app rather than a page. The viewport is pinned, exactly one region scrolls, and
the header and dock are a layout route that mounts once — so navigating between
tabs moves an indicator instead of repainting the chrome. Sheets are draggable,
taps have no highlight rectangle, safe areas are respected, and inputs are 16px
so focusing one never zooms the layout.

The look is a single committed one: black canvas, one green accent, hairline
outlines and mono numerals. There is no theme switcher, because there is no
second theme to switch to.

### How syncing works

Every write updates the screen first, then goes to the server. If it fails — offline, flaky connection, server error — the entity is recorded in an outbox and retried on reconnect.

The outbox holds *references*, not snapshots. A flush sends whatever the record looks like at that moment, so ten quick edits collapse into one request and a stale queue can never resurrect an old value. Unsent work is always replayed before a fetch, so refreshing cannot overwrite something you just changed.

Attendance rows are keyed on `(subject, date, session)`. Row ids come from the database and the local id is reconciled with the server's on the first successful write, which is what makes deleting a freshly created record reliable.

## Checks

```bash
npm run check     # typecheck, tests, production build
```

Individually: `npm run typecheck`, `npm test`, `npm run build`.

The test suite covers the attendance maths (including float boundaries and unreachable targets), local-date handling across timezones and DST, CSV escaping and formula injection, timetable expansion when a schedule changes mid-term, and full render passes over onboarding, the daily check-in, validation, persistence and dialog focus behaviour.

## Deploy

Vercel deploys `main` automatically. For a manual release:

```bash
npx vercel --prod
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for Production, Preview and Development.

## Privacy

Every row is scoped to its owner by Row Level Security, and a trigger rejects any attendance record filed against a subject you do not own. Presently keeps a local copy for offline use and clears it when you sign out, so the next person to open the app on a shared device sees nothing.

---

Made for a little more certainty in a busy week.
