# Presently

## Attendance, without the mental arithmetic.

Presently is a beautifully focused attendance tracker for people who want a clear answer before they decide to miss a class.

Open the app. Mark what happened. See exactly where you stand.

**Live:** [presently-beta.vercel.app](https://presently-beta.vercel.app)

<br />

## The important number, made obvious

Most attendance trackers stop at a percentage. Presently goes one step further.

For every subject, it tells you one of two things:

- **You can miss N more classes** and remain on target.
- **Attend your next N classes** to get back on target.

That is the whole point: less calculation, less uncertainty, more confidence.

## Designed for the everyday

Presently is built as a calm, capable utility—not a dashboard full of noise.

- A fast daily check-in for every scheduled class
- Four clear states: Present, Absent, Cancelled, Holiday
- A calendar for catching up or correcting a past day
- Per-subject history, targets, schedules, and archive controls
- Weighted overall attendance, never misleading averages
- Private sign-in with email magic links or passwords
- CSV export, dark mode, installable PWA support, and offline cached viewing

## Open source, commercially usable

Presently is released under the [MIT License](LICENSE). You are free to use, modify, distribute, sell, and build on it, provided the license notice is retained.

The product name and visual identity are not a promise of endorsement or affiliation with any third party.

## Build it locally

Requirements: Node.js 22+ and npm.

```bash
git clone https://github.com/nabrahma/Presently.git
cd Presently
npm install
copy .env.example .env.local
npm run dev
```

Vite will print a local URL, normally `http://localhost:5173`.

## Connect Supabase

Create `.env.local` from `.env.example`:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-key
```

The browser must only receive the publishable/anon key. Never commit a service-role key, database password, or Personal Access Token.

For a fresh project, apply the included schema:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push --dry-run
npx supabase db push
```

Then set your deployed URL in **Authentication → URL Configuration** as both the Site URL and an allowed redirect URL. Add `http://localhost:5173` for local development.

The complete schema, indexes, signup trigger, and Row Level Security policies are in [supabase/migrations/20260728_initial_schema.sql](supabase/migrations/20260728_initial_schema.sql).

## The math

Only Present and Absent count toward attendance. Cancelled and Holiday sessions are deliberately excluded.

```text
percentage = round(P / (P + A) × 100, 1)
bunkable   = floor(P / target − (P + A))
comeback   = ceil((target × (P + A) − P) / (1 − target))
```

The overview is weighted across all active subjects. The implementation and examples are tested in [src/lib/attendanceMath.test.ts](src/lib/attendanceMath.test.ts).

## Architecture

| Layer | Choice |
| --- | --- |
| Application | React, TypeScript, Vite |
| Interface | Custom accessible components, Lucide icons |
| Authentication and data | Supabase Auth, Postgres, Row Level Security |
| Installability | Workbox via vite-plugin-pwa |
| Hosting | Vercel |

The project deliberately stays small:

```text
src/
  App.tsx                 screens and routes
  lib/attendanceMath.ts   tested, pure attendance calculations
  lib/store.tsx           session-aware local/remote state
  lib/supabaseClient.ts   browser-safe Supabase client
supabase/
  migrations/             versioned database schema
```

## Quality checks

```bash
npm test
npm run build
```

The production build creates the PWA manifest, service worker, and static assets in `dist/`.

## Deploy

Vercel deploys pushes to `main` automatically. For a manual production release:

```bash
npx vercel --prod
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel for Production, Preview, and Development.

## Privacy

Every record is protected by Supabase Row Level Security and scoped to its authenticated owner. Presently keeps a small local cache for offline viewing, then clears that cache on sign-out before another account can load.

---

Made for a little more certainty in a busy week.
