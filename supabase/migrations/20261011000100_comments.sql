-- Descriptions that show up when Claude (or anyone) inspects the schema through
-- the Supabase connector, so a chat without this repo still knows the rules.

comment on schema public is
  'Personal training app. Rules for edits: never change past sessions or any sets row unless asked; '
  'lasting plan changes edit template_slots/template_items then call regenerate_sessions(today, end); '
  'one-off changes edit that session and set sessions.customized = true; log every edit in changes '
  '(author = ''claude'', summary, reason, affects_from); ask before deleting; dates are America/New_York; '
  'pounds, meters, seconds.';

comment on table public.exercises is 'Exercise library. measure says which set fields to log.';
comment on table public.cycles is 'Training cycles (usually 12 weeks, deloads in weeks 6 and 12). One active at a time.';
comment on table public.template_slots is 'Weekly plan: one row per ISO weekday (1 = Monday).';
comment on table public.template_items is 'Exercises in each template day with their prescription (jsonb). min_week/max_week/week_parity gate items inside a cycle.';
comment on table public.sessions is 'Dated training days generated from the template (slot_id set) or added by hand (slot_id null). customized = edited individually; regeneration skips it.';
comment on table public.session_exercises is 'Exercises in a session with their own copy of the prescription.';
comment on table public.sets is 'What was actually done, one row per set. Past logs: never edit or delete unless asked.';
comment on table public.feats is 'Goals such as 315 bench or front lever. stage: now, next, background, achieved.';
comment on table public.feat_steps is 'Ladder steps for each feat; is_goal marks the feat itself; achieved_on when hit.';
comment on table public.milestones is 'Anything hit worth recording: a ladder step, a PR, a time trial.';
comment on table public.media is 'Photos and videos in the private media bucket at <user_id>/<file>.';
comment on table public.metrics is 'Measurements: training_max (with exercise_id), bodyweight, touch_height, mile_time, 5k_time.';
comment on table public.changes is 'Change log. Add a row for every edit to the plan or data.';

comment on column public.template_items.prescription is
  'Keys: sets, sets_max, reps, reps_max, per_side, pct_tm, load_lb, seconds, seconds_max, minutes, minutes_max, '
  'distance_m, target_seconds, contacts, contacts_max, rest_s, intensity. Heavy lifts: {"scheme":"ladder","warmups":[...],"steps":[{"pct":79,"reps":5},...]}.';

comment on function public.generate_sessions(date, date, uuid) is
  'Create missing planned sessions from the template for dates in the active cycle. Idempotent.';
comment on function public.regenerate_sessions(date, date, uuid) is
  'Rebuild planned future sessions after a template change; skips started, logged or customized sessions.';
comment on function public.start_cycle(text, date, integer, uuid) is
  'Close the active cycle, start a new one and generate its first four weeks.';
