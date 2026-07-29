# Presently — Technical Design

## What this is

A personal attendance tracker, mobile-first, installable, backed by a private account. It covers subject timetables, a one-tap daily check-in, calendar backfilling, weighted analytics, and the per-subject safety margin against a target.

It deliberately excludes institution integrations, social features, notifications, native apps, and anything resembling a timetable-scheduling engine.

## Constraints

- Personal-scale software, deployed as a static site with a hosted Postgres behind it.
- The device's local calendar day is the authority for what "today" means.
- Offline support means: read what you have, write optimistically, retry on reconnect. It is not a conflict-resolution system.
- Baselines, not stretch goals: a 360px viewport, keyboard and screen-reader access, colour never carrying meaning alone, per-user data isolation at the database level, and a small dependency footprint.

## Decisions

| Decision | Alternatives | Reason |
| --- | --- | --- |
| Vite React client talking straight to Supabase | Custom backend; IndexedDB-only | Meets the auth and privacy requirements with the least to maintain. |
| Hand-rolled store with an outbox | TanStack Query; Redux | The hard part here is offline write ordering, not caching. An outbox models that directly; a query cache would sit beside it rather than solve it. |
| Tailwind v4 over CSS custom properties | Hand-written CSS; a component library | One token layer defines the palette; utilities compose it. The colour system stays a single source of truth and the bundle stays small. |
| Vaul for sheets | A hand-rolled dialog; Radix directly | Drag-to-dismiss is the single biggest thing separating an installed app from a website. Vaul wraps Radix Dialog, so focus trapping, Escape and scroll lock come with it. |
| Motion for transitions | CSS transitions | A shared-element indicator that slides between tabs cannot be expressed in CSS without duplicating layout maths. |
| Dark only | A theme switcher | The product has one visual identity. A second theme doubles the surface to design, test and get wrong, for a preference this app does not need. |
| Persistent layout route for the shell | A wrapper each screen imports | A wrapper remounts the header and dock on every navigation, which is what makes a PWA read as a website. |
| Pure, shared attendance module | Per-screen calculation | Guarantees every screen shows the same number and makes the formulas directly testable. |
| Integer arithmetic in the maths module | Fractional target | `0.75 × 20` is `14.999999999999998` in floating point, which silently breaks the exactly-on-target case. |

## Interface

The reference is an instrument panel: hairline outlines, tiny all-caps labels,
large mono numerals, and one accent doing all the signalling. Presently applies
that to a black canvas with a single green accent.

Two rules keep it consistent. Every value on screen is a label/readout pair, so
the pattern is a component rather than a habit. And colour never carries meaning
alone — the selected state in any control is also the only filled one, so the
app still reads in greyscale and to a screen reader.

The shell pins itself to the viewport with exactly one scroll region inside it.
The page itself never scrolls, which removes the rubber-band bounce that gives a
PWA away. Today is sized to fit a normal timetable without scrolling at all.

## Architecture

React Router owns the routes behind a shared authenticated shell, mounted once
as a layout route so the chrome survives navigation. Today ships in the entry
chunk because it is the reason the app gets opened; every other screen is
loaded on first visit, which keeps the drawer and calendar libraries off the
launch path. Access control has three distinct states — loading, unauthenticated, setup-incomplete — and never collapses them, because collapsing "loading" into "unauthenticated" is what previously pushed returning users back through onboarding.

The store holds one `AppData` value, persists it per account, and mirrors it into refs so background work reads committed state rather than a stale closure. Writes are optimistic; failures mark the entity dirty in an outbox and surface a toast. The outbox stores references rather than payloads, so replays always send current values.

Timetable expansion is shared between the check-in and the calendar, and folds in records whose sessions no longer match the schedule — otherwise changing a timetable mid-term would hide already-marked classes from the only screen that can correct them.

## Data integrity

Row Level Security scopes every table to its owner. A trigger additionally rejects attendance filed against a subject belonging to someone else, and rejects dates in the future. Constraints cover blank names, colour format, target range, session counts, and length limits, so the client is not the only thing standing between a typo and the database.

## Testing

Attendance formulas are verified against the worked examples and by exhaustive sweeps asserting each answer is correct *and* minimal. Date handling is tested across timezone offsets, DST, leap years and month boundaries. CSV output is checked for quote escaping, newline flattening and spreadsheet formula injection. Render tests drive real flows — onboarding, marking a class, replacing a status, validation failures, persistence across a reload, corrupted cache recovery, and dialog focus behaviour.

## Formula note

The original specification's first worked example has an arithmetic slip: with 12 present out of 17 counted classes at a 75% target, the required run is `ceil((0.75 × 17 − 12) / 0.25) = 3`, not 1. The implementation follows the stated formula, which the verifiable `15 / 20 = 75%` result confirms.
