-- A safety net for logged data: every row that's deleted, and the old version
-- of every row that's changed, is copied into public.trash first. Nothing the
-- app, the SQL editor or Claude does can lose a log for good; restore a row by
-- inserting trash.old_row back into its table.
--
-- Planned rows that regeneration rebuilds anyway (a planned, untouched session
-- and its exercises) aren't copied, so template edits don't flood the trash.

create table public.trash (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  table_name text not null,
  op text not null check (op in ('UPDATE', 'DELETE')),
  old_row jsonb not null,
  changed_at timestamptz not null default now()
);

create index trash_user_table on public.trash (user_id, table_name, changed_at desc);

alter table public.trash enable row level security;
-- Read-only for the owner: the trash is written by the trigger, never edited.
create policy "own trash: read" on public.trash for select to authenticated using (user_id = auth.uid());

comment on table public.trash is
  'Copies of deleted rows and the old version of changed rows, for undo. Restore by inserting old_row back. Never delete from it.';

create or replace function public.keep_in_trash()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := to_jsonb(old);
begin
  -- Skip what regeneration recreates: planned, untouched sessions and their exercises.
  if tg_table_name = 'sessions' and v_old ->> 'status' = 'planned' and not (v_old ->> 'customized')::boolean then
    return null;
  end if;
  if tg_table_name = 'session_exercises' and tg_op = 'DELETE' then
    return null; -- logged sets block deleting these, so only plan rows ever go
  end if;
  if tg_op = 'UPDATE' and v_old = to_jsonb(new) then
    return null;
  end if;
  insert into public.trash (user_id, table_name, op, old_row)
  values ((v_old ->> 'user_id')::uuid, tg_table_name, tg_op, v_old);
  return null;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'sets', 'sessions', 'session_exercises', 'metrics', 'milestones', 'media',
    'feats', 'feat_steps', 'exercises', 'template_slots', 'template_items', 'cycles'
  ] loop
    execute format(
      'create trigger %I after update or delete on public.%I for each row execute function public.keep_in_trash()',
      t || '_keep_in_trash', t
    );
  end loop;
end $$;
