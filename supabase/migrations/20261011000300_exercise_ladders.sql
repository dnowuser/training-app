-- Let a skill exercise show your current ladder step during the workout.
--
-- exercises.feat_id links an exercise to the feat whose ladder says what to do
-- in it (handstand push-up -> its ladder from pike push-ups up). The app shows
-- the first step not yet achieved, with feat_steps.how explaining exactly how
-- to do that step.

alter table public.exercises add column feat_id uuid references public.feats (id) on delete set null;
alter table public.feat_steps add column how text;

comment on column public.exercises.feat_id is
  'Feat whose ladder this exercise practises. The app shows that feat''s current step (first not achieved) on the exercise.';
comment on column public.feat_steps.how is
  'How to do this step in a session: setup, form cues, what counts as hitting it. Shown on the exercise card.';
