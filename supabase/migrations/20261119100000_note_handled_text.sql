-- A day's notes grow: more "Exercise: note" lines get appended after earlier ones
-- were handled. handled_text keeps the note as it read when it was marked done, so
-- anything added since shows as open again (More → Notes), instead of hiding under
-- the earlier "done".

alter table public.note_status add column handled_text text;

comment on column public.note_status.handled_text is
  'The note text as it was when marked done. If the note has grown since, the new part is open. Null on rows from before this column: treated as covering the whole note.';
