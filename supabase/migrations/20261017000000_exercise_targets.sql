-- What each exercise works and which feats it builds toward, for the exercise
-- library, the cards on the Today screen, feats on the calendar and the weekly
-- muscle map.

alter table public.exercises add column muscles text[] not null default '{}';

comment on column public.exercises.muscles is
  'Muscles (or, for stretches, areas) the exercise works, plain words: chest, front delts, quads, hamstrings, cardio...';

create table public.exercise_feats (
  user_id uuid not null default public.current_owner() references auth.users (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  feat_id uuid not null references public.feats (id) on delete cascade,
  primary key (exercise_id, feat_id)
);

create index exercise_feats_feat on public.exercise_feats (feat_id);

alter table public.exercise_feats enable row level security;
create policy "own rows" on public.exercise_feats for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create trigger exercise_feats_keep_in_trash after update or delete on public.exercise_feats
  for each row execute function public.keep_in_trash();

comment on table public.exercise_feats is
  'Which feats an exercise builds toward (many to many). exercises.feat_id is separate: the one ladder an exercise practises.';
