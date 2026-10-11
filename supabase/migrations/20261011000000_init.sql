-- Training app schema.
--
-- The weekly plan lives in template_slots + template_items. generate_sessions()
-- copies it into dated sessions + session_exercises inside the active cycle, and
-- you log what you actually did as sets. Feats have ladders (feat_steps), and
-- milestones record each step or PR you hit. media, metrics and changes round it out.
--
-- Every row belongs to one user (user_id) and is protected by row-level security.
-- When Claude or an admin runs SQL without a signed-in user, current_owner()
-- resolves to the account owner, so inserts and the generator functions still work.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- The signed-in user, or (for admin/SQL sessions with no user) the first account.
create or replace function public.current_owner()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    auth.uid(),
    (select u.id from auth.users u order by u.created_at limit 1)
  )
$$;

revoke execute on function public.current_owner() from public, anon;
grant execute on function public.current_owner() to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Exercise library
-- ---------------------------------------------------------------------------

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default public.current_owner() references auth.users (id) on delete cascade,
  slug text not null,
  name text not null,
  area text not null check (area in ('lifting', 'jumping', 'running', 'calisthenics', 'mobility', 'accessory', 'movement')),
  -- Which fields the app asks for when you log a set.
  measure text not null check (measure in ('load_reps', 'reps', 'hold', 'distance', 'load_distance', 'contacts', 'duration')),
  cues text,
  created_at timestamptz not null default now(),
  unique (user_id, slug)
);

-- ---------------------------------------------------------------------------
-- Cycles and the weekly template
-- ---------------------------------------------------------------------------

create table public.cycles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default public.current_owner() references auth.users (id) on delete cascade,
  name text not null,
  start_date date not null,
  weeks smallint not null default 12 check (weeks between 1 and 52),
  deload_weeks smallint[] not null default '{6,12}',
  status text not null default 'active' check (status in ('planned', 'active', 'done')),
  notes text,
  created_at timestamptz not null default now()
);

create index cycles_user_status on public.cycles (user_id, status, start_date desc);

-- One row per weekday (ISO: 1 = Monday ... 7 = Sunday).
create table public.template_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default public.current_owner() references auth.users (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  name text not null,
  day_type text not null check (day_type in ('hard', 'easy', 'recovery', 'rest')),
  mobility text,
  notes text,
  updated_at timestamptz not null default now(),
  unique (user_id, weekday)
);

create trigger template_slots_updated_at before update on public.template_slots
  for each row execute function public.set_updated_at();

create table public.template_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default public.current_owner() references auth.users (id) on delete cascade,
  slot_id uuid not null references public.template_slots (id) on delete cascade,
  position smallint not null,
  exercise_id uuid not null references public.exercises (id),
  block text not null check (block in ('warmup', 'skill', 'power', 'strength', 'conditioning', 'accessory', 'mobility')),
  -- Target for the exercise; shape documented in CLAUDE.md ("Prescriptions").
  prescription jsonb not null default '{}',
  notes text,
  -- Optional gating inside a cycle: only weeks min_week..max_week, only odd or even weeks.
  min_week smallint,
  max_week smallint,
  week_parity text check (week_parity in ('odd', 'even')),
  updated_at timestamptz not null default now()
);

create index template_items_slot on public.template_items (slot_id, position);

create trigger template_items_updated_at before update on public.template_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Sessions, their exercises, and logged sets
-- ---------------------------------------------------------------------------

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default public.current_owner() references auth.users (id) on delete cascade,
  date date not null,
  cycle_id uuid references public.cycles (id) on delete set null,
  week smallint,
  -- The template slot it was generated from; null for an extra session you added by hand.
  slot_id uuid references public.template_slots (id) on delete set null,
  name text not null,
  day_type text not null check (day_type in ('hard', 'easy', 'recovery', 'rest')),
  is_deload boolean not null default false,
  -- Set true when this one session is edited by hand, so regeneration leaves it alone.
  customized boolean not null default false,
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'done', 'partial', 'skipped')),
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sessions_user_date on public.sessions (user_id, date);
-- At most one generated session per day; hand-added extras (slot_id null) are unlimited.
create unique index sessions_one_generated_per_day on public.sessions (user_id, date) where slot_id is not null;

create trigger sessions_updated_at before update on public.sessions
  for each row execute function public.set_updated_at();

create table public.session_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default public.current_owner() references auth.users (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  position smallint not null,
  exercise_id uuid not null references public.exercises (id),
  block text not null check (block in ('warmup', 'skill', 'power', 'strength', 'conditioning', 'accessory', 'mobility')),
  prescription jsonb not null default '{}',
  notes text,
  skipped boolean not null default false,
  template_item_id uuid references public.template_items (id) on delete set null
);

create index session_exercises_session on public.session_exercises (session_id, position);

create table public.sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default public.current_owner() references auth.users (id) on delete cascade,
  -- restrict: a session with logged sets can't be deleted by accident.
  session_exercise_id uuid not null references public.session_exercises (id) on delete restrict,
  set_number smallint not null,
  side text check (side in ('left', 'right')),
  is_warmup boolean not null default false,
  reps smallint,
  load_lb numeric(6, 1),
  seconds numeric(7, 1),
  distance_m numeric(8, 1),
  contacts smallint,
  rpe numeric(3, 1) check (rpe between 1 and 10),
  hit_target boolean,
  note text,
  logged_at timestamptz not null default now()
);

create index sets_session_exercise on public.sets (session_exercise_id, set_number);

-- ---------------------------------------------------------------------------
-- Feats, ladder steps and milestones
-- ---------------------------------------------------------------------------

create table public.feats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default public.current_owner() references auth.users (id) on delete cascade,
  slug text not null,
  name text not null,
  area text not null check (area in ('lifting', 'jumping', 'running', 'calisthenics', 'mobility')),
  stage text not null default 'now' check (stage in ('now', 'next', 'background', 'achieved')),
  target text,
  unlock text,
  rough_time text,
  notes text,
  position smallint not null default 0,
  achieved_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug)
);

create trigger feats_updated_at before update on public.feats
  for each row execute function public.set_updated_at();

create table public.feat_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default public.current_owner() references auth.users (id) on delete cascade,
  feat_id uuid not null references public.feats (id) on delete cascade,
  step_number smallint not null,
  description text not null,
  target jsonb not null default '{}',
  is_goal boolean not null default false,
  is_bonus boolean not null default false,
  achieved_on date,
  unique (feat_id, step_number)
);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default public.current_owner() references auth.users (id) on delete cascade,
  feat_id uuid references public.feats (id) on delete set null,
  feat_step_id uuid references public.feat_steps (id) on delete set null,
  title text not null,
  achieved_on date not null default current_date,
  -- What you hit, e.g. {"load_lb": 275, "reps": 1} or {"seconds": 372}.
  value jsonb not null default '{}',
  session_id uuid references public.sessions (id) on delete set null,
  set_id uuid references public.sets (id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create index milestones_user_date on public.milestones (user_id, achieved_on desc);

-- ---------------------------------------------------------------------------
-- Media, metrics and the change log
-- ---------------------------------------------------------------------------

create table public.media (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default public.current_owner() references auth.users (id) on delete cascade,
  -- Path inside the private 'media' bucket: <user_id>/<file name>.
  storage_path text not null unique,
  kind text not null check (kind in ('photo', 'video')),
  taken_on date not null default current_date,
  caption text,
  tags text[] not null default '{}',
  session_id uuid references public.sessions (id) on delete set null,
  exercise_id uuid references public.exercises (id) on delete set null,
  feat_id uuid references public.feats (id) on delete set null,
  milestone_id uuid references public.milestones (id) on delete set null,
  created_at timestamptz not null default now()
);

create index media_user_date on public.media (user_id, taken_on desc);

create table public.metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default public.current_owner() references auth.users (id) on delete cascade,
  -- e.g. training_max (with exercise_id), bodyweight, touch_height, mile_time, 5k_time.
  kind text not null,
  exercise_id uuid references public.exercises (id) on delete set null,
  value numeric not null,
  unit text not null check (unit in ('lb', 'in', 's', 'm')),
  measured_on date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

create index metrics_user_kind on public.metrics (user_id, kind, measured_on desc);

create table public.changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default public.current_owner() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  author text not null check (author in ('user', 'claude', 'app')),
  summary text not null,
  reason text,
  affects_from date,
  details jsonb not null default '{}'
);

create index changes_user_created on public.changes (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row-level security: each user sees and writes only their own rows
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'exercises', 'cycles', 'template_slots', 'template_items', 'sessions',
    'session_exercises', 'sets', 'feats', 'feat_steps', 'milestones',
    'media', 'metrics', 'changes'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Session generation
-- ---------------------------------------------------------------------------

-- Deload week version of a prescription: halve sets and jump contacts, swap the
-- heavy ladder for 3 x 3 at 70%. Warm-ups, mobility and timed practice blocks
-- (handstand practice, backflip work) stay as normal because they have no sets.
create or replace function public.deload_prescription(p_block text, p jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  r jsonb := p;
begin
  if p_block in ('warmup', 'mobility') then
    return p;
  end if;
  if p ->> 'scheme' = 'ladder' then
    return jsonb_build_object(
      'sets', 3, 'reps', 3, 'pct_tm', 70,
      'rest_s', coalesce((p ->> 'rest_s')::int, 180),
      'deload', true
    );
  end if;
  if r ? 'sets' then
    r := (r - 'sets_max') || jsonb_build_object('sets', ceil((r ->> 'sets')::numeric / 2)::int);
  end if;
  if r ? 'contacts' then
    r := (r - 'contacts_max') || jsonb_build_object('contacts', ceil((r ->> 'contacts')::numeric / 2)::int);
  end if;
  return r || jsonb_build_object('deload', true);
end $$;

-- Create planned sessions from the weekly template for every date in
-- [p_from, p_to] that falls inside the active cycle and has no generated
-- session yet. Returns how many sessions it created.
create or replace function public.generate_sessions(
  p_from date,
  p_to date,
  p_user uuid default public.current_owner()
)
returns integer
language plpgsql
as $$
declare
  v_date date;
  v_cycle public.cycles%rowtype;
  v_slot public.template_slots%rowtype;
  v_week smallint;
  v_deload boolean;
  v_session_id uuid;
  v_count integer := 0;
begin
  if p_user is null then
    raise exception 'generate_sessions: no user. Sign up in the app first.';
  end if;

  for v_date in select d::date from generate_series(p_from, p_to, interval '1 day') as d loop
    select * into v_cycle
      from public.cycles c
     where c.user_id = p_user
       and c.status = 'active'
       and v_date >= c.start_date
       and v_date < c.start_date + c.weeks * 7
     order by c.start_date desc
     limit 1;
    continue when not found;

    select * into v_slot
      from public.template_slots s
     where s.user_id = p_user
       and s.weekday = extract(isodow from v_date);
    continue when not found;

    continue when exists (
      select 1 from public.sessions s
       where s.user_id = p_user and s.date = v_date and s.slot_id is not null
    );

    v_week := ((v_date - v_cycle.start_date) / 7) + 1;
    v_deload := v_week = any (v_cycle.deload_weeks);

    insert into public.sessions (user_id, date, cycle_id, week, slot_id, name, day_type, is_deload)
    values (p_user, v_date, v_cycle.id, v_week, v_slot.id, v_slot.name, v_slot.day_type, v_deload)
    returning id into v_session_id;

    insert into public.session_exercises
      (user_id, session_id, position, exercise_id, block, prescription, notes, template_item_id)
    select
      p_user,
      v_session_id,
      row_number() over (order by ti.position),
      ti.exercise_id,
      ti.block,
      case when v_deload then public.deload_prescription(ti.block, ti.prescription) else ti.prescription end,
      ti.notes,
      ti.id
    from public.template_items ti
    where ti.slot_id = v_slot.id
      and (ti.min_week is null or v_week >= ti.min_week)
      and (ti.max_week is null or v_week <= ti.max_week)
      and (
        ti.week_parity is null
        or (ti.week_parity = 'odd' and v_week % 2 = 1)
        or (ti.week_parity = 'even' and v_week % 2 = 0)
      );

    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

-- Rebuild planned sessions in [p_from, p_to] after a template change. Skips any
-- session that has started, has logged sets, or was customized by hand.
create or replace function public.regenerate_sessions(
  p_from date,
  p_to date,
  p_user uuid default public.current_owner()
)
returns integer
language plpgsql
as $$
begin
  if p_user is null then
    raise exception 'regenerate_sessions: no user. Sign up in the app first.';
  end if;

  delete from public.sessions s
   where s.user_id = p_user
     and s.date between p_from and p_to
     and s.slot_id is not null
     and s.status = 'planned'
     and not s.customized
     and not exists (
       select 1
         from public.session_exercises se
         join public.sets st on st.session_exercise_id = se.id
        where se.session_id = s.id
     );

  return public.generate_sessions(p_from, p_to, p_user);
end $$;

-- Close any active cycle, start a new one and generate its first four weeks.
create or replace function public.start_cycle(
  p_name text,
  p_start date,
  p_weeks integer default 12,
  p_user uuid default public.current_owner()
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  if p_user is null then
    raise exception 'start_cycle: no user. Sign up in the app first.';
  end if;

  update public.cycles set status = 'done' where user_id = p_user and status = 'active';

  insert into public.cycles (user_id, name, start_date, weeks)
  values (p_user, p_name, p_start, p_weeks)
  returning id into v_id;

  perform public.generate_sessions(p_start, p_start + 27, p_user);

  insert into public.changes (user_id, author, summary, affects_from)
  values (p_user, 'app', format('Started %s (%s weeks)', p_name, p_weeks), p_start);

  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Read-only views for the app and for Claude
-- ---------------------------------------------------------------------------

-- One row per logged set (or per planned exercise with no sets yet).
create or replace view public.session_log
with (security_invoker = true)
as
select
  s.user_id,
  s.date,
  s.week,
  s.name as session,
  s.status,
  s.is_deload,
  se.position,
  e.name as exercise,
  e.slug as exercise_slug,
  e.measure,
  se.block,
  se.prescription,
  se.skipped,
  st.set_number,
  st.side,
  st.is_warmup,
  st.reps,
  st.load_lb,
  st.seconds,
  st.distance_m,
  st.contacts,
  st.rpe,
  st.hit_target,
  st.note as set_note,
  s.id as session_id,
  se.id as session_exercise_id,
  st.id as set_id
from public.sessions s
join public.session_exercises se on se.session_id = s.id
join public.exercises e on e.id = se.exercise_id
left join public.sets st on st.session_exercise_id = se.id;

-- Each feat with its current ladder step (the first step not yet achieved).
create or replace view public.feat_progress
with (security_invoker = true)
as
select
  f.id,
  f.user_id,
  f.slug,
  f.name,
  f.area,
  f.stage,
  f.target,
  f.achieved_on,
  f.position,
  count(fs.id) as steps_total,
  count(fs.achieved_on) as steps_done,
  (select n.step_number from public.feat_steps n
    where n.feat_id = f.id and n.achieved_on is null
    order by n.step_number limit 1) as current_step,
  (select n.description from public.feat_steps n
    where n.feat_id = f.id and n.achieved_on is null
    order by n.step_number limit 1) as current_step_description
from public.feats f
left join public.feat_steps fs on fs.feat_id = f.id
group by f.id;

-- ---------------------------------------------------------------------------
-- Media storage: a private bucket, one folder per user
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;

create policy "media: read own" on storage.objects for select to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "media: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "media: update own" on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "media: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
