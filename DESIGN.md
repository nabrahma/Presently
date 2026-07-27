# Presently — Accepted Technical Design

## Understanding

Presently is a mobile-first, personal attendance-tracking PWA for ABV-IIITM students. It supports private accounts, subject schedules, one-tap daily marking, calendar backfilling, weighted attendance analytics, and the actionable per-subject safety margin for a default 75% target. It intentionally excludes ERP integrations, social features, reminders, native applications, and complex scheduling.

## Assumptions and constraints

- This is personal-scale software deployed as a static Vercel site.
- Supabase credentials will be provided through Vite environment variables before production deployment.
- Browser-local dates are the authority for attendance records (the intended user region is India).
- Offline functionality prioritizes cached viewing, immediate UI feedback, and retry on reconnect; it is not a full conflict-resolution system.
- Accessibility, a 360px minimum viewport, private data access through Supabase RLS, and a low dependency footprint are baseline requirements.

## Decision log

| Decision | Alternatives considered | Reason |
| --- | --- | --- |
| Vite React client backed directly by Supabase | IndexedDB-only app; custom backend | Meets auth/privacy needs with lowest maintenance cost. |
| TanStack Query for server state | Redux/Zustand; bespoke state | Enables compact optimistic mutations and automatic reconnect behavior. |
| Small local accessible UI primitives with Tailwind | Large pre-generated component library | Preserves the shadcn design spirit while keeping the bundle and surface area small. |
| Pure shared attendance math module | Per-page calculations | Guarantees consistent numbers and makes formulas directly testable. |
| Native browser APIs plus lightweight PWA tooling | A large mobile framework | Provides installation and caching without treating a web app like a native app. |
| No trend chart in v1 | Recharts-based analytics | Trend arrows/charts are optional and add dependency weight without changing core decisions. |

## Architecture

React Router owns the specified routes and a shared authenticated shell. A typed Supabase client, query hooks, and optimistic mutations handle the profile, subjects, schedules, and records. Attendance rows are upserted using the unique subject/date/session key. The dashboard and calendar share the same schedule-expansion and status-control components. The PWA precaches the application shell and reports offline state clearly.

## Reliability and testing

Mutations update immediately, roll back visibly on failure, and refetch/retry after reconnect. Attendance formulas are unit tested against the PRD examples and boundary cases. The app will be built and type checked before handoff, alongside manual checks for responsive layout, status replacement, export, keyboard focus, and color-independent labels.

### Formula clarification

The PRD's first comeback worked example has an arithmetic typo: with 12 presents from 17 counted classes at a 75% target, the required consecutive present classes are `ceil((0.75 × 17 − 12) / 0.25) = 3`, not 1. The implementation follows the stated formula and the verifiable 15/20 = 75% result.
