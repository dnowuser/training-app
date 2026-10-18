import type { SupabaseClient } from '@supabase/supabase-js'
import { check } from './api'
import type { NoteStatus } from './types'

/** A note written anywhere in the app, with whether it's been dealt with. */
export interface Note {
  source: NoteStatus['source']
  sourceId: string
  date: string
  /** Where it was written: an exercise, "Session" or a milestone title. */
  where: string
  text: string
  status: NoteStatus | null
}

export const isDone = (n: Note) => Boolean(n.status?.done_on)

export async function loadNotes(db: SupabaseClient): Promise<Note[]> {
  const [sessions, sets, milestones, statuses] = await Promise.all([
    db.from('sessions').select('id, date, notes').not('notes', 'is', null),
    db
      .from('sets')
      .select('id, note, item:session_exercises(exercise:exercises(name), session:sessions(date))')
      .not('note', 'is', null),
    db.from('milestones').select('id, achieved_on, title, note').not('note', 'is', null),
    db.from('note_status').select('id, source, source_id, done_on, response'),
  ])
  const byKey = new Map(check<NoteStatus[]>(statuses).map((s) => [`${s.source}:${s.source_id}`, s]))
  const status = (source: Note['source'], id: string) => byKey.get(`${source}:${id}`) ?? null
  type SetRow = { id: string; note: string; item: { exercise: { name: string }; session: { date: string } } }
  const notes: Note[] = [
    ...check<{ id: string; date: string; notes: string }[]>(sessions).map((s) => ({
      source: 'session' as const,
      sourceId: s.id,
      date: s.date,
      where: 'Session',
      text: s.notes,
      status: status('session', s.id),
    })),
    ...check<SetRow[]>(sets).map((s) => ({
      source: 'set' as const,
      sourceId: s.id,
      date: s.item.session.date,
      where: s.item.exercise.name,
      text: s.note,
      status: status('set', s.id),
    })),
    ...check<{ id: string; achieved_on: string; title: string; note: string }[]>(milestones).map((m) => ({
      source: 'milestone' as const,
      sourceId: m.id,
      date: m.achieved_on,
      where: m.title,
      text: m.note,
      status: status('milestone', m.id),
    })),
  ]
  return notes.filter((n) => n.text.trim()).sort((a, b) => b.date.localeCompare(a.date))
}

/** Mark a note done (with what was done about it) or open again. The note itself is never changed. */
export async function setNoteDone(db: SupabaseClient, note: Note, doneOn: string | null, response: string | null): Promise<NoteStatus> {
  const fields = { done_on: doneOn, response: response?.trim() || null }
  const query = note.status
    ? db.from('note_status').update(fields).eq('id', note.status.id)
    : db.from('note_status').insert({ source: note.source, source_id: note.sourceId, ...fields })
  return check<NoteStatus>(await query.select('id, source, source_id, done_on, response').single())
}
