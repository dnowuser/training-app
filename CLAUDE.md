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
src/main.tsx              router and screen list; registers public/sw.js in production: offline app shell, plus a saved copy of every Supabase read, served when there's no signal or it's too slow (4 s)
src/components/           Layout (auth gate, tab bar, sync banner), DayView (a day's sessions: logging, edits),
                          SessionOptions, PrescriptionForm, MediaGallery, LineChart, RestTimer, SignIn
src/routes/               one file per screen: Today, Day, Calendar, Feats, Progress, Media, Search, Review, Plan, Exercises, Notes, Overview (/week: week and month plan)
src/lib/supabase.ts       client; null until .env.local is filled in
src/lib/types.ts          row types + the Prescription jsonb shape
src/lib/api.ts            day loading/caching, set logging, one-off session edits (each writes a changes row)
src/lib/offline.ts        queue for sets logged without signal; SyncBanner sends them when back online
src/lib/outbox.ts         other changes made without signal (set edits, RPE, skip, start/finish, training max after finish), sent after the set queue
src/lib/prefetch.ts       loads the next week of days and this week's plan while there's signal
src/lib/finish.ts         training max changes after a finished session (now, or later for one finished offline)
src/lib/plan.ts           template edits + regenerate_sessions, cycles, change log
src/lib/feats.ts, media.ts, progress.ts, calendar.ts, search.ts, review.ts, library.ts, muscles.ts, notes.ts, sections.ts, overview.ts   data for those screens
src/lib/prescription.ts   ladder loads from training max, set expansion, one-line summaries
src/lib/logging.ts        what a tap logs per measure, hit_target, set labels, rest after a set
src/lib/dates.ts          local-date helpers (sessions are keyed by local date)
supabase/migrations/      schema; never edit an applied migration, add a new file
supabase/seed.sql         generated; initial exercises, template and feats
data/program.json         source for the seed only; after setup the database is the source of truth
scripts/                  seed generator and the PGlite database test
docs/                     training plan and app plan
```

## Data model

Every table has `user_id` (defaults to `public.current_owner()`) and a row-level security policy `user_id = auth.uid()`, except `muscle_ref`, a read-only anatomy reference.

| Table | One row is |
| --- | --- |
| exercises | A movement in the library: `slug`, `area`, `measure` (which fields to log), `cues` (full how-to; the Today screen shows it), `muscles` (text[]: what it works, plain words), optional `feat_id` (the ladder it practises), optional `group_name` (drills that belong together, e.g. "Foot work"; consecutive drills of a group fold under one header on the day view), `muscle_detail` (text[]: specific muscles from `muscle_ref`, main movers first) |
| exercise_feats | Which feats an exercise builds toward (many to many); shown on cards, the calendar and the exercise library |
| cycles | A training cycle: `start_date`, `weeks` (12), `deload_weeks` ({6,12}), `status` |
| template_slots | One weekday of the weekly plan (ISO weekday, 1 = Monday): name, `day_type`, mobility label |
| template_items | One exercise in a template day: `position`, `block`, `prescription`, optional `min_week`/`max_week`/`week_parity` |
| sessions | One dated day, generated from the template or added by hand (`slot_id` null). `status`, `is_deload`, `customized`, `moved_from` (original date when moved; that date isn't regenerated) |
| session_exercises | One exercise in a session, with its own copy of the prescription |
| sets | One logged set: reps, `load_lb`, seconds, `distance_m`, contacts, optional rpe, `hit_target`, note |
| feats | A feat: `stage` (now, next, background, achieved), target, unlock condition |
| feat_steps | Ladder steps for a feat; `is_goal` marks the feat itself, `achieved_on` when hit, `how` (how to do the step). An exercise with `feat_id` shows the first unachieved step and follows its `target.sets`/`target.reps` |
| milestones | Anything hit worth recording: a ladder step, a PR, a time trial. Links to feat, step, session, set |
| media | A photo or video in the `media` bucket at `<user_id>/<file>`, tagged to session, exercise, feat or milestone |
| metrics | A measurement: `training_max` (with `exercise_id`), `bodyweight`, `touch_height`, `mile_time`, `5k_time` |
| changes | The change log: who (`user`, `claude`, `app`), summary, reason, `affects_from`, details |
| muscle_ref | Anatomy reference shared by everyone (no `user_id`): `name`, `part` > `grp` > muscle, `side` (front/back), `half` (upper/core/lower), `ppl`, `position` (head to toe). `exercises.muscle_detail` uses its names |
| note_status | Whether a note (on a session, set or milestone) is handled: `source`, `source_id`, `done_on`, `response`. No row = open. The note itself is never edited |
| trash | A deleted row, or the old version of a changed row, kept for undo (written by a trigger; read-only) |

Safety net: a trigger copies every deleted row, and the old version of every changed row, into `trash` (`table_name`, `op`, `old_row`), except planned untouched sessions that regeneration rebuilds. Restore with `insert into <table> select * from jsonb_populate_record(null::<table>, old_row)`. Never delete from `trash`. More → Your data downloads a full JSON backup or a CSV of every logged set.

Views: `session_log` (one row per logged set, or per planned exercise with no sets) and `feat_progress` (each feat with its current step).

Functions (all default `p_user` to `current_owner()`, so they work from the SQL editor or the Supabase connector):

- `start_cycle(name, start_date, weeks = 12)`: closes the active cycle, opens a new one, generates its first 4 weeks.
- `generate_sessions(from, to)`: creates missing planned sessions from the template inside the active cycle. Applies deload weeks (sets and contacts halved, the ladder becomes 3 x 3 at 70%), `min_week`/`max_week` gating and odd/even weeks. Idempotent.
- `regenerate_sessions(from, to)`: deletes and rebuilds planned future sessions after a template change. Never touches sessions that started, have logged sets, or are `customized`.

Logged sets reference `session_exercises` with `on delete restrict`, so a session with sets can't be deleted by accident.

## Prescriptions

`prescription` is jsonb. Keys (all optional): `sets`, `sets_max`, `reps`, `reps_max`, `per_side`, `pct_tm` (percent of the exercise's training max), `load_lb`, `seconds`, `seconds_max`, `minutes`, `minutes_max`, `distance_m`, `target_seconds` (goal time per rep), `contacts`, `contacts_max`, `rest_s`, `intensity` (free text, e.g. "light"), `deload` (set by the generator).

Heavy lifts use `{"scheme": "ladder", "warmups": [{"pct": 33, "reps": 10}, {"pct": 56, "reps": 10}], "steps": [{"pct": 79, "reps": 5}, {"pct": 86, "reps": 3}, {"pct": 91, "reps": 1}, {"pct": 96, "reps": 1}, {"pct": 91, "reps": 1}, {"pct": 91, "reps": 1}], "rest_s": 180}` (bench Sun and Fri, squat Mon and Sat, deadlift Wed); Tuesday bench is the light day: 79% x 5, 86% x 3, then 3 singles at 91% (no 96%, so the training max holds). Loads come from the latest `metrics` row with `kind = 'training_max'` for that exercise, rounded to 5 lb (`src/lib/prescription.ts`). Progression is adaptive (`src/lib/progression.ts`). When a session with a ladder is finished, the app moves that lift's training max by the top set (the first set at the ladder's highest percentage, the 96% single; a light ladder that never reaches 95%, like Tuesday's 3 singles at 91%, leaves it alone): RPE ≤ 7 a full step (+5 lb bench, +10 lb squat/deadlift), RPE 7.5–8.5 half a step, RPE 9–9.5 hold, RPE 10 or a missed rep down half a step, no RPE logged but hit half a step up; never in deload weeks. The new `metrics` row is dated the next day and gets a `changes` row (author `app`). Accessories with a load use double progression: every work set at the top of the rep range last time means +5 lb next time. Skill ladders prompt a move up after 3 sessions in a row on target. Every work set asks for RPE (`sets.rpe`). The rule's wording on Plan → Cycle comes from `TRAINING_MAX_RULE` in the same file, so change both together; `cycles.notes` is free text Wayson edits in the app.

## Rules for changing the plan or the data

These apply to every Claude, whether in a coding session or in chat through the Supabase connector:

1. Never edit or delete past logs (sessions before today, any `sets` row) unless Wayson explicitly asks for that specific correction.
2. Lasting change → edit `template_slots`/`template_items`, then `select regenerate_sessions(<today>, <end of generated range>)`. One-off change → edit that session's `session_exercises` and set `sessions.customized = true`.
3. Write one `changes` row for every edit: `author = 'claude'`, a one-line `summary`, the `reason`, and `affects_from`.
4. Ask before deleting anything.
5. Dates are local (America/New_York). Pass explicit dates to functions; don't rely on `current_date`, which is UTC on the server.
6. Weights in pounds, distances in meters, times in seconds.
7. Wayson's notes (`sessions.notes`, `sets.note`, `milestones.note`) are requests. Check them at the start of a review; when one is handled, insert a `note_status` row with `done_on` and a one-line `response` saying what was done (More → Notes shows open and done).

## Writing for the Today screen

Wayson should never have to leave the Today screen to know what to do. Every exercise's `cues` says how to do it (setup, form, what to log) in plain words, and every ladder step's `how` says how to do that step and when to move up. Don't write "current ladder step" or similar without the app showing the step: link the exercise with `feat_id` instead.

## Working on the code

- Schema changes: add `supabase/migrations/<timestamp>_<name>.sql`, extend `scripts/test-db.mjs` to cover it, keep `src/lib/types.ts` in sync, run `npm run check`.
- The PGlite test stubs Supabase's `auth` and `storage` schemas; anything else Supabase-specific needs a stub there too.
- Progress → Feat outlook: each feat's history plus a dashed projection to the goal and its date. Pace per feat lives in `FEAT_MODELS` (`src/lib/outlook.ts`): measured feats (training max, mile/5K time, touch height) gain less each month; ladder feats use the fast end of their usual range, or Wayson's own pace once two steps are done and it's faster.
- More → Week and month plan (`/week`): estimated minutes per day by block, a training-balance body map (sets per region against `REGION_TARGET` in `src/lib/overview.ts`, red to green), a muscle tree from `muscle_ref` and feats in sets or minutes. A muscle in `muscle_ref` needs a body-map region in `REGION_OF` there and, if it's on the surface, a shape in `src/lib/anatomy.ts` (the outlined front/back anatomy map; deep muscles go in `NOT_DRAWN`).
- The day view groups exercises into folding sections by block (open until every set in it is logged), and drills sharing `exercises.group_name` into a folding group inside.
- Works offline: reads come from the service worker's saved copy; writes on the Today/Day screen go to the set queue or the outbox. A new write elsewhere should either queue the same way or say plainly that it needs signal.
- Keep the UI mobile-first, thumb-reachable and fast to log with one hand. Big tap targets on the Today screen. The set you're on is open on its card with ± buttons (tap its header to fold it); every other open set is one line with weight/reps boxes, an RPE picker and ✓. Tapping ✓ on a logged set unchecks it (the row goes to the trash, so it can be restored). Tapping a logged set's text opens it for editing; tapping the editor's header closes it. Warm-up sets fold behind one line and don't count toward sets left or the next set. Tapping an exercise's name folds its card. A note typed in an exercise's Edit form is appended to the day's notes (so it shows in Notes).
- A new exercise needs `cues`, `muscles`, `muscle_detail` and its `exercise_feats` rows, or the card, library and muscle map will have gaps.
- Don't add a dependency when a few lines will do.
- Don't commit `.env.local` or any key. The browser only ever gets the publishable (anon) key.

## Status

- Live: Supabase project `ucctcbocfoietldrrqea` (connected to claude.ai), deployed on Vercel. Cycle 1 started Mon 2026-10-12; sessions are generated through 2026-11-11.
- Built: phase 1 (sign-in, Today with set logging and rest timer, Calendar, Day detail with one-off edits and moving, offline set queue and app shell), phase 2 (Feats with ladders and milestones, photo and video uploads, Progress charts with target lines, Media timeline and compare), phase 3 (Search, Plan editor with regeneration, change log, cycle controls, Week review with a summary for Claude).
- The database is ahead of `data/program.json`: mobility blocks are now specific exercises, zone 2 has a 156 bpm cap (Wayson is 24, 5 ft 9, 160 lb), lifting comes before running on Sat and Sun, Tuesday has bench back-off sets, Thursday has an easy run, Sunday runs lengthen over the cycle, bench training max is 215, and feats carry ETAs in `rough_time`. Read the database, not the seed, for the current plan.
- Open decisions are listed at the end of docs/app-plan.md.
