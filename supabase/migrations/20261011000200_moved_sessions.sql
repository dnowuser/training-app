-- Moving a session to another day (Day detail in the app).
--
-- moved_from records the date a generated session was planned for. The
-- generator treats that date as taken, so regenerating doesn't recreate the
-- session you moved, and a moved session may share a day with that day's own
-- generated session.

alter table public.sessions add column moved_from date;

comment on column public.sessions.moved_from is
  'Date the session was originally generated for, when it was moved to another day. That date is not regenerated.';

drop index public.sessions_one_generated_per_day;
create unique index sessions_one_generated_per_day on public.sessions (user_id, date)
  where slot_id is not null and moved_from is null;

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

    -- Skip a day that already has its generated session, or whose session was moved away.
    continue when exists (
      select 1 from public.sessions s
       where s.user_id = p_user
         and ((s.date = v_date and s.slot_id is not null and s.moved_from is null) or s.moved_from = v_date)
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

comment on function public.generate_sessions(date, date, uuid) is
  'Create missing planned sessions from the template for dates in the active cycle. Idempotent. Skips dates a session was moved away from.';
