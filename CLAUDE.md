# Training app

Wayson's personal training app. Open it and today's workout is fully lined up; log what you hit set by set; see every past and future day; track 17 feats (315 bench, 315 squat, 405 deadlift, dunks, sub-6:00 mile, front lever, planche, splits, pancake and more) with ladders, photos, video and progress charts. Claude reads and edits the same Supabase database from chat, so the plan can be reviewed and improved based on what he actually hits.

- Program and feats: [docs/training-plan.md](docs/training-plan.md)
- Product plan, screens, build phases, open questions: [docs/app-plan.md](docs/app-plan.md)
- Setup steps for a fresh Supabase project: [README.md](README.md)

## Commands

```bash
npm run dev            # Vite dev server
npm run build          # type-check + production build
npm run lint           # oxlint
npm test               # vitest unit tests (src/**/*.test.ts)
npm run db:test        # runs every migration + seed in in-memory Postgres (PGlite) and checks generation, deloads, RLS
npm run seed:generate  # rebuild supabase/seed.sql from data/program.json
npm run check          # all of the above; run before every commit
```

## Stack

React 19 + TypeScript + Vite, React Router (data router in `src/main.tsx`), Tailwind CSS v4, `@supabase/supabase-js`. Supabase provides Postgres, auth, and the private `media` storage bucket. Hosted on Vercel (`vercel.json` rewrites all paths to the SPA). Mobile-first: it's used on a phone at the gym and added to the home screen.

## Layout

```
src/main.tsx              router and screen list
src/components/           Layout (auth gate, bottom tab bar), SignIn, RestTimer, shared UI
src/routes/Today.tsx      Today screen: today's session, one-tap set logging, finish
src/routes/screens.tsx    other screens (placeholders until each phase builds them)
src/lib/api.ts            Supabase queries the screens use (loadDay, insertSet, ...)
src/lib/logging.ts        what a tap logs per measure, hit_target, set labels, rest after a set
src/lib/auth.ts           useAuthSession
src/lib/restTimer.ts      rest timer context (provider in components/RestTimer.tsx)
src/lib/supabase.ts       client; null until .env.local is filled in
src/lib/types.ts          row types + the Prescription jsonb shape
src/lib/prescription.ts   ladder loads from training max, set expansion, one-line summaries
src/lib/dates.ts          local-date helpers (sessions are keyed by local date)
supabase/migrations/      schema; never edit an applied migration, add a new file
supabase/seed.sql         generated; initial exercises, template and feats
data/program.json         source for the seed only; after setup the database is the source of truth
scripts/                  seed generator and the PGlite database test
docs/                     training plan and app plan
```

## Data model

Every table has `user_id` (defaults to `public.current_owner()`) and a row-level security policy `user_id = auth.uid()`.

| Table | One row is |
| --- | --- |
| exercises | A movement in the library: `slug`, `area`, `measure` (which fields to log), `cues` |
| cycles | A training cycle: `start_date`, `weeks` (12), `deload_weeks` ({6,12}), `status` |
| template_slots | One weekday of the weekly plan (ISO weekday, 1 = Monday): name, `day_type`, mobility label |
| template_items | One exercise in a template day: `position`, `block`, `prescription`, optional `min_week`/`max_week`/`week_parity` |
| sessions | One dated day, generated from the template or added by hand (`slot_id` null). `status`, `is_deload`, `customized` |
| session_exercises | One exercise in a session, with its own copy of the prescription |
| sets | One logged set: reps, `load_lb`, seconds, `distance_m`, contacts, optional rpe, `hit_target`, note |
| feats | A feat: `stage` (now, next, background, achieved), target, unlock condition |
| feat_steps | Ladder steps for a feat; `is_goal` marks the feat itself, `achieved_on` when hit |
| milestones | Anything hit worth recording: a ladder step, a PR, a time trial. Links to feat, step, session, set |
| media | A photo or video in the `media` bucket at `<user_id>/<file>`, tagged to session, exercise, feat or milestone |
| metrics | A measurement: `training_max` (with `exercise_id`), `bodyweight`, `touch_height`, `mile_time`, `5k_time` |
| changes | The change log: who (`user`, `claude`, `app`), summary, reason, `affects_from`, details |

Views: `session_log` (one row per logged set, or per planned exercise with no sets) and `feat_progress` (each feat with its current step).

Functions (all default `p_user` to `current_owner()`, so they work from the SQL editor or the Supabase connector):

- `start_cycle(name, start_date, weeks = 12)`: closes the active cycle, opens a new one, generates its first 4 weeks.
- `generate_sessions(from, to)`: creates missing planned sessions from the template inside the active cycle. Applies deload weeks (sets and contacts halved, the ladder becomes 3 x 3 at 70%), `min_week`/`max_week` gating and odd/even weeks. Idempotent.
- `regenerate_sessions(from, to)`: deletes and rebuilds planned future sessions after a template change. Never touches sessions that started, have logged sets, or are `customized`.

Logged sets reference `session_exercises` with `on delete restrict`, so a session with sets can't be deleted by accident.

## Prescriptions

`prescription` is jsonb. Keys (all optional): `sets`, `sets_max`, `reps`, `reps_max`, `per_side`, `pct_tm` (percent of the exercise's training max), `load_lb`, `seconds`, `seconds_max`, `minutes`, `minutes_max`, `distance_m`, `target_seconds` (goal time per rep), `contacts`, `contacts_max`, `rest_s`, `intensity` (free text, e.g. "light"), `deload` (set by the generator).

Heavy lifts use `{"scheme": "ladder", "warmups": [{"pct": 40, "reps": 5}, ...], "steps": [{"pct": 79, "reps": 5}, {"pct": 86, "reps": 3}, {"pct": 91, "reps": 1}, {"pct": 96, "reps": 1}], "rest_s": 180}`. Loads come from the latest `metrics` row with `kind = 'training_max'` for that exercise, rounded to 5 lb (`src/lib/prescription.ts`). Progression: +5 lb on the bench max and +10 lb on squat and deadlift each cycle while every top single moves well.

## Rules for changing the plan or the data

These apply to every Claude, whether in a coding session or in chat through the Supabase connector:

1. Never edit or delete past logs (sessions before today, any `sets` row) unless Wayson explicitly asks for that specific correction.
2. Lasting change → edit `template_slots`/`template_items`, then `select regenerate_sessions(<today>, <end of generated range>)`. One-off change → edit that session's `session_exercises` and set `sessions.customized = true`.
3. Write one `changes` row for every edit: `author = 'claude'`, a one-line `summary`, the `reason`, and `affects_from`.
4. Ask before deleting anything.
5. Dates are local (America/New_York). Pass explicit dates to functions; don't rely on `current_date`, which is UTC on the server.
6. Weights in pounds, distances in meters, times in seconds.

## Working on the code

- Schema changes: add `supabase/migrations/<timestamp>_<name>.sql`, extend `scripts/test-db.mjs` to cover it, keep `src/lib/types.ts` in sync, run `npm run check`.
- The PGlite test stubs Supabase's `auth` and `storage` schemas; anything else Supabase-specific needs a stub there too.
- Keep the UI mobile-first, thumb-reachable and fast to log with one hand. Big tap targets on the Today screen.
- Don't add a dependency when a few lines will do.
- Don't commit `.env.local` or any key. The browser only ever gets the publishable (anon) key.

## Status

- Done: schema, generator functions, seed data for the current program, app shell, tests. Phase 1 so far: email sign-in (code or link, no sign-ups), Today screen (ladder loads from the training max, one-tap set logging with edit/undo, skip, finish), rest timer.
- Next (phase 1): create the Supabase project and connect it to claude.ai, run the migration and seed, record training maxes, start Cycle 1. Then the Calendar and Day detail, and offline queueing of sets. Deploy to Vercel.
- Open decisions are listed at the end of docs/app-plan.md.
