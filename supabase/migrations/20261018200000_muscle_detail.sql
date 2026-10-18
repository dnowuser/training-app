-- A reference tree of specific muscles (body part -> group -> muscle), the same for
-- everyone, and each exercise's specific muscles. exercises.muscles stays the broad
-- list the body diagram draws; exercises.muscle_detail names the actual muscles,
-- main movers first, using muscle_ref.name.

create table public.muscle_ref (
  name text primary key,
  part text not null,
  grp text not null,
  side text not null check (side in ('front', 'back', 'other')),
  half text not null check (half in ('upper', 'core', 'lower', 'other')),
  ppl text not null check (ppl in ('push', 'pull', 'legs', 'other')),
  position int not null
);

alter table public.muscle_ref enable row level security;
create policy "anyone signed in reads" on public.muscle_ref for select to authenticated using (true);

comment on table public.muscle_ref is
  'Anatomy reference, top of the body to the bottom (position). part > grp > name; side, half and ppl drive the other groupings.';

insert into public.muscle_ref (name, part, grp, side, half, ppl, position) values
  ('neck flexors', 'Neck', 'Neck', 'front', 'upper', 'other', 1),
  ('neck extensors', 'Neck', 'Neck', 'back', 'upper', 'other', 2),
  ('front delts', 'Shoulders', 'Delts', 'front', 'upper', 'push', 3),
  ('side delts', 'Shoulders', 'Delts', 'front', 'upper', 'push', 4),
  ('rear delts', 'Shoulders', 'Delts', 'back', 'upper', 'pull', 5),
  ('supraspinatus', 'Shoulders', 'Rotator cuff', 'back', 'upper', 'pull', 6),
  ('infraspinatus', 'Shoulders', 'Rotator cuff', 'back', 'upper', 'pull', 7),
  ('teres minor', 'Shoulders', 'Rotator cuff', 'back', 'upper', 'pull', 8),
  ('subscapularis', 'Shoulders', 'Rotator cuff', 'front', 'upper', 'pull', 9),
  ('upper chest', 'Chest', 'Pecs', 'front', 'upper', 'push', 10),
  ('mid chest', 'Chest', 'Pecs', 'front', 'upper', 'push', 11),
  ('lower chest', 'Chest', 'Pecs', 'front', 'upper', 'push', 12),
  ('serratus anterior', 'Chest', 'Serratus', 'front', 'upper', 'push', 13),
  ('upper traps', 'Back', 'Traps', 'back', 'upper', 'pull', 14),
  ('mid traps', 'Back', 'Traps', 'back', 'upper', 'pull', 15),
  ('lower traps', 'Back', 'Traps', 'back', 'upper', 'pull', 16),
  ('rhomboids', 'Back', 'Upper back', 'back', 'upper', 'pull', 17),
  ('lats', 'Back', 'Lats', 'back', 'upper', 'pull', 18),
  ('teres major', 'Back', 'Lats', 'back', 'upper', 'pull', 19),
  ('thoracic spine', 'Back', 'Spine', 'back', 'core', 'other', 20),
  ('erector spinae', 'Back', 'Lower back', 'back', 'core', 'other', 21),
  ('quadratus lumborum', 'Back', 'Lower back', 'back', 'core', 'other', 22),
  ('biceps', 'Arms', 'Biceps', 'front', 'upper', 'pull', 23),
  ('brachialis', 'Arms', 'Biceps', 'front', 'upper', 'pull', 24),
  ('triceps long head', 'Arms', 'Triceps', 'back', 'upper', 'push', 25),
  ('triceps lateral and medial heads', 'Arms', 'Triceps', 'back', 'upper', 'push', 26),
  ('brachioradialis', 'Arms', 'Forearms', 'front', 'upper', 'pull', 27),
  ('forearm flexors', 'Arms', 'Forearms', 'front', 'upper', 'pull', 28),
  ('forearm extensors', 'Arms', 'Forearms', 'back', 'upper', 'pull', 29),
  ('wrists', 'Arms', 'Wrists', 'front', 'upper', 'other', 30),
  ('rectus abdominis', 'Core', 'Abs', 'front', 'core', 'other', 31),
  ('obliques', 'Core', 'Obliques', 'front', 'core', 'other', 32),
  ('transverse abdominis', 'Core', 'Deep core', 'front', 'core', 'other', 33),
  ('hip flexors', 'Hips', 'Hip flexors', 'front', 'lower', 'legs', 34),
  ('glute max', 'Hips', 'Glutes', 'back', 'lower', 'legs', 35),
  ('glute med', 'Hips', 'Glutes', 'back', 'lower', 'legs', 36),
  ('glute min', 'Hips', 'Glutes', 'back', 'lower', 'legs', 37),
  ('deep hip rotators', 'Hips', 'Hip rotators', 'back', 'lower', 'legs', 38),
  ('adductors', 'Hips', 'Adductors', 'front', 'lower', 'legs', 39),
  ('rectus femoris', 'Thighs', 'Quads', 'front', 'lower', 'legs', 40),
  ('vastus lateralis', 'Thighs', 'Quads', 'front', 'lower', 'legs', 41),
  ('vastus medialis', 'Thighs', 'Quads', 'front', 'lower', 'legs', 42),
  ('biceps femoris', 'Thighs', 'Hamstrings', 'back', 'lower', 'legs', 43),
  ('inner hamstrings', 'Thighs', 'Hamstrings', 'back', 'lower', 'legs', 44),
  ('gastrocnemius', 'Lower legs', 'Calves', 'back', 'lower', 'legs', 45),
  ('soleus', 'Lower legs', 'Calves', 'back', 'lower', 'legs', 46),
  ('tibialis anterior', 'Lower legs', 'Shins', 'front', 'lower', 'legs', 47),
  ('peroneals', 'Lower legs', 'Shins', 'front', 'lower', 'legs', 48),
  ('foot intrinsics', 'Feet', 'Arches', 'front', 'lower', 'legs', 49),
  ('toe flexors', 'Feet', 'Toes', 'front', 'lower', 'legs', 50),
  ('heart and lungs', 'Cardio', 'Cardio', 'other', 'other', 'other', 51);

alter table public.exercises add column muscle_detail text[] not null default '{}';

comment on column public.exercises.muscle_detail is
  'Specific muscles (muscle_ref.name), main movers first. exercises.muscles is the broad list for the body diagram.';
