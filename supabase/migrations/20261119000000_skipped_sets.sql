-- Skipping single sets (swipe a set on the day view).
--
-- skipped_sets lists the planned set numbers of an exercise that were skipped on
-- that day. They don't count toward sets left, the next set or finishing, and a
-- skipped ladder top set leaves the training max where it is.

alter table public.session_exercises add column skipped_sets smallint[] not null default '{}';

comment on column public.session_exercises.skipped_sets is
  'Planned set numbers skipped on this day (swiped away in the app). Not logged, not counted.';
