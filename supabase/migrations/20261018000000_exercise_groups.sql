-- Drills that belong together (the parts of foot work, the reactive jump drills)
-- share a group_name; the day view folds consecutive drills of a group under one header.
alter table public.exercises add column group_name text;

-- Whether a note (on a session, a set or a milestone) has been dealt with, and how.
-- The note itself is never edited; this row sits beside it.
create table public.note_status (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default public.current_owner() references auth.users (id) on delete cascade,
  source text not null check (source in ('session', 'set', 'milestone')),
  source_id uuid not null,
  done_on date,
  response text,
  created_at timestamptz not null default now(),
  unique (user_id, source, source_id)
);

alter table public.note_status enable row level security;
create policy "own rows" on public.note_status for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create trigger note_status_keep_in_trash after update or delete on public.note_status
  for each row execute function public.keep_in_trash();

comment on table public.note_status is
  'One row per note that has been answered: done_on when it was dealt with, response says what was done. No row = open.';
