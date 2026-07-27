# Presently

Presently is a mobile-first attendance tracker for ABV-IIITM students. It is an installable PWA that turns a weekly timetable into a fast daily check-in and shows exactly where each subject stands against its attendance target.

**Live app:** [presently-beta.vercel.app](https://presently-beta.vercel.app)

## What it does

- Email magic-link authentication, with optional email/password sign-in.
- First-run onboarding for branch, semester, subjects, attendance target, and weekly schedule.
- One-tap `Present`, `Absent`, `Cancelled`, and `Holiday` marking for each class session.
- Calendar-based backfilling and editing for any date.
- Weighted overall attendance plus per-subject status, history, archive controls, and CSV export.
- The useful answer at a glance: how many classes can be missed safely, or how many must be attended consecutively to recover.
- Private Supabase data protected by Row Level Security.
- Light/dark themes, offline app-shell support, a cached offline view, and an install prompt.

## Stack

| Area | Technology |
| --- | --- |
| UI | React 19, TypeScript, Vite, custom accessible components, Lucide |
| Routing | React Router |
| Dates | date-fns |
| Auth and data | Supabase Auth + Postgres + RLS |
| PWA | vite-plugin-pwa / Workbox |
| Hosting | Vercel |
| Tests | Vitest |

## Quick start

Prerequisites: Node.js 22 or newer and npm.

```bash
git clone https://github.com/nabrahma/Presently.git
cd Presently
npm install
copy .env.example .env.local
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). Without environment variables, the UI still supports local demo/onboarding flows. Add Supabase values to enable authentication and cloud sync.

## Environment variables

Create `.env.local` from `.env.example`:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-key
```

Only the Supabase publishable/anon key belongs in the browser. Never add a service-role key, database password, or Personal Access Token to any `VITE_*` variable, source file, or Vercel environment variable.

## Supabase setup

The production project is already linked and migrated. For a new Supabase project:

1. Create a project in Supabase and copy its Project URL and publishable key.
2. Add the two variables above locally and in Vercel.
3. Generate a Supabase Personal Access Token, then link and apply the migration:

   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push --dry-run
   npx supabase db push
   ```

4. In **Authentication → URL Configuration**, set the Site URL and allowed redirect URL to your deployed application URL. Add `http://localhost:5173` for local development.

The schema lives at [supabase/migrations/20260728_initial_schema.sql](supabase/migrations/20260728_initial_schema.sql). It creates `profiles`, `subjects`, `subject_schedule`, and `attendance_records`; indexes the ownership/look-up paths; creates a profile on signup; and applies per-user RLS policies.

## Attendance rules

For a subject:

- `P` is the number of present records.
- `A` is the number of absent records.
- `T = P + A`.
- Cancelled and holiday records are excluded from both numerator and denominator.
- `τ` is the subject target as a fraction (75% becomes `0.75`).

```text
percentage = round(P / T × 100, 1)        when T > 0
bunkable   = floor(P / τ − T)             when P / T ≥ τ
comeback   = ceil((τ × T − P) / (1 − τ))  when P / T < τ
```

The dashboard percentage is weighted across all active subjects: `sum(P) / sum(T)`, not an average of subject percentages. The formulas and edge cases are covered by [attendanceMath.test.ts](src/lib/attendanceMath.test.ts).

> The original PRD’s 12/17 recovery example contains a small arithmetic typo: three consecutive attended classes are needed to reach 75% (`15/20`), not one.

## Project layout

```text
src/
  App.tsx                    routes and screens
  styles.css                 responsive visual system
  lib/
    attendanceMath.ts        tested, pure attendance calculations
    store.tsx                session-aware local/remote state and offline cache
    supabaseClient.ts        browser-safe Supabase client
  types.ts                   application domain types
supabase/
  config.toml                local Supabase/Auth configuration
  migrations/                versioned database schema
public/icon.svg              PWA application icon
```

## Routes

| Route | Purpose |
| --- | --- |
| `/auth/sign-in` | Magic-link or password sign-in |
| `/auth/sign-up` | Email/password account creation |
| `/onboarding` | Profile and recurring timetable setup |
| `/` | Today’s check-in, weighted overview, at-risk subjects |
| `/subjects` | Subject management and archive view |
| `/subjects/:id` | Per-subject safety margin and history |
| `/calendar` | Monthly backfill and editing |
| `/settings` | Profile, theme, CSV export, sign-out, local-cache reset |

## Quality checks

```bash
npm test       # attendance-math unit tests
npm run build  # TypeScript check + production PWA bundle
```

The production build creates the service worker, manifest, and static assets in `dist/`.

## Deployment

Vercel is connected to the `main` branch, so pushes trigger deployments automatically. For a manual production deployment:

```bash
npx vercel --prod
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for Production, Preview, and Development in Vercel before deploying. The app is a static Vite build; no server-side secret is required.

## Privacy and offline behavior

Each Supabase table is restricted to its authenticated owner through RLS. The browser retains a small attendance cache to make the last loaded data available offline. On Supabase sign-out, Presently clears that cache before another account can load, preventing data from one user being shown to another on the same device.

Offline writes update the interface immediately and rely on the Supabase client/session reconnect path. This is intentionally lightweight: it is not a multi-device conflict-resolution engine.

## License

Private project for Presently. Add a license before publishing it as open source.
