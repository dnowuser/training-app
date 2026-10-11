import type { SupabaseClient } from '@supabase/supabase-js'
import { latestTrainingMaxes, type SetValues } from './logging'
import type { Exercise, LoggedSet, Session, SessionExercise } from './types'

export type DaySession = Session & { slot: { mobility: string | null } | null }
export type DayExercise = SessionExercise & { exercise: Exercise }

export interface Day {
  /** Generated session first, then any extras added by hand. */
  sessions: DaySession[]
  exercises: DayExercise[]
  sets: LoggedSet[]
  /** Latest training max on or before the date, by exercise id. */
  trainingMaxes: Map<string, number>
}

function check<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message)
  return data as T
}

/** Everything the Today screen needs for one local date. */
export async function loadDay(db: SupabaseClient, date: string): Promise<Day> {
  const sessions = check<DaySession[]>(
    await db
      .from('sessions')
      .select('*, slot:template_slots(mobility)')
      .eq('date', date)
      .order('slot_id', { ascending: true, nullsFirst: false })
      .order('created_at'),
  )
  if (sessions.length === 0) return { sessions, exercises: [], sets: [], trainingMaxes: new Map() }

  const exercises = check<DayExercise[]>(
    await db
      .from('session_exercises')
      .select('*, exercise:exercises(*)')
      .in(
        'session_id',
        sessions.map((s) => s.id),
      )
      .order('position'),
  )
  const exerciseIds = [...new Set(exercises.map((e) => e.exercise_id))]

  const [sets, maxes] = await Promise.all([
    exercises.length
      ? db
          .from('sets')
          .select('*')
          .in(
            'session_exercise_id',
            exercises.map((e) => e.id),
          )
          .order('set_number')
          .order('logged_at')
      : { data: [], error: null },
    exerciseIds.length
      ? db
          .from('metrics')
          .select('exercise_id, value')
          .eq('kind', 'training_max')
          .in('exercise_id', exerciseIds)
          .lte('measured_on', date)
          .order('measured_on', { ascending: false })
          .order('created_at', { ascending: false })
      : { data: [], error: null },
  ])

  return {
    sessions,
    exercises,
    sets: check<LoggedSet[]>(sets),
    trainingMaxes: latestTrainingMaxes(check<{ exercise_id: string | null; value: number }[]>(maxes)),
  }
}

export interface NewSet extends SetValues {
  session_exercise_id: string
  set_number: number
  is_warmup: boolean
  hit_target: boolean
  note?: string | null
}

export async function insertSet(db: SupabaseClient, set: NewSet): Promise<LoggedSet> {
  return check<LoggedSet>(await db.from('sets').insert(set).select().single())
}

export async function updateSet(
  db: SupabaseClient,
  id: string,
  patch: SetValues & { hit_target: boolean; note?: string | null },
): Promise<LoggedSet> {
  // Fields left blank in the editor are cleared, not kept.
  const row = {
    reps: patch.reps ?? null,
    load_lb: patch.load_lb ?? null,
    seconds: patch.seconds ?? null,
    distance_m: patch.distance_m ?? null,
    contacts: patch.contacts ?? null,
    hit_target: patch.hit_target,
    note: patch.note ?? null,
  }
  return check<LoggedSet>(await db.from('sets').update(row).eq('id', id).select().single())
}

/** Only from the Today screen, when you undo a set you just logged. */
export async function deleteSet(db: SupabaseClient, id: string): Promise<void> {
  check(await db.from('sets').delete().eq('id', id))
}

export async function updateSession(
  db: SupabaseClient,
  id: string,
  patch: Partial<Pick<Session, 'status' | 'started_at' | 'completed_at'>>,
): Promise<DaySession> {
  return check<DaySession>(
    await db.from('sessions').update(patch).eq('id', id).select('*, slot:template_slots(mobility)').single(),
  )
}

export async function setSkipped(db: SupabaseClient, id: string, skipped: boolean): Promise<void> {
  check(await db.from('session_exercises').update({ skipped }).eq('id', id))
}

// ---------------------------------------------------------------------------
// Offline copy of a day, so the gym screen still opens without signal
// ---------------------------------------------------------------------------

export function cacheDay(date: string, day: Day) {
  try {
    localStorage.setItem(`day:${date}`, JSON.stringify({ ...day, trainingMaxes: [...day.trainingMaxes] }))
  } catch {
    // Storage full or blocked; the screen still works online.
  }
}

export function cachedDay(date: string): Day | null {
  try {
    const raw = localStorage.getItem(`day:${date}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Omit<Day, 'trainingMaxes'> & { trainingMaxes: [string, number][] }
    return { ...parsed, trainingMaxes: new Map(parsed.trainingMaxes) }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Editing a session by hand (Day detail). Each edit marks the session
// customized so regeneration leaves it alone, and writes a change-log row.
// ---------------------------------------------------------------------------

export async function logChange(
  db: SupabaseClient,
  change: { summary: string; reason?: string | null; affects_from?: string | null; details?: Record<string, unknown> },
): Promise<void> {
  check(
    await db.from('changes').insert({
      author: 'user',
      summary: change.summary,
      reason: change.reason || null,
      affects_from: change.affects_from ?? null,
      details: change.details ?? {},
    }),
  )
}

export async function markCustomized(db: SupabaseClient, sessionId: string): Promise<void> {
  check(await db.from('sessions').update({ customized: true }).eq('id', sessionId))
}

export async function moveSession(db: SupabaseClient, session: Session, toDate: string): Promise<void> {
  const patch = { date: toDate, customized: true, moved_from: session.moved_from ?? (session.slot_id ? session.date : null) }
  check(await db.from('sessions').update(patch).eq('id', session.id))
  await logChange(db, {
    summary: `Moved ${session.name} from ${session.date} to ${toDate}`,
    affects_from: session.date < toDate ? session.date : toDate,
    details: { session_id: session.id, from: session.date, to: toDate },
  })
}

export async function updateSessionNotes(db: SupabaseClient, id: string, notes: string): Promise<void> {
  check(await db.from('sessions').update({ notes: notes || null }).eq('id', id))
}

export async function updateSessionExercise(
  db: SupabaseClient,
  item: DayExercise,
  session: Session,
  patch: Pick<SessionExercise, 'prescription' | 'notes'>,
  reason?: string,
): Promise<void> {
  check(await db.from('session_exercises').update(patch).eq('id', item.id))
  await markCustomized(db, session.id)
  await logChange(db, {
    summary: `${item.exercise.name} on ${session.date} changed for that day only`,
    reason,
    affects_from: session.date,
    details: { session_exercise_id: item.id, before: item.prescription, after: patch.prescription },
  })
}

export async function addSessionExercise(
  db: SupabaseClient,
  session: Session,
  exercise: Exercise,
  block: SessionExercise['block'],
  prescription: SessionExercise['prescription'],
  position: number,
): Promise<void> {
  check(
    await db.from('session_exercises').insert({ session_id: session.id, exercise_id: exercise.id, block, prescription, position }),
  )
  await markCustomized(db, session.id)
  await logChange(db, {
    summary: `Added ${exercise.name} to ${session.name} on ${session.date}`,
    affects_from: session.date,
  })
}

/** Only for an exercise with no logged sets; the database refuses otherwise. */
export async function removeSessionExercise(db: SupabaseClient, item: DayExercise, session: Session): Promise<void> {
  check(await db.from('session_exercises').delete().eq('id', item.id))
  await markCustomized(db, session.id)
  await logChange(db, {
    summary: `Removed ${item.exercise.name} from ${session.name} on ${session.date}`,
    affects_from: session.date,
    details: { prescription: item.prescription },
  })
}

export async function listExercises(db: SupabaseClient): Promise<Exercise[]> {
  return check<Exercise[]>(await db.from('exercises').select('*').order('name'))
}

export { check }

/** A hand-added session (slot_id null), e.g. an extra workout or a rest-day session. */
export async function addSession(db: SupabaseClient, date: string, name: string): Promise<void> {
  check(await db.from('sessions').insert({ date, name, day_type: 'easy' }))
  await logChange(db, { summary: `Added a session "${name}" on ${date}`, affects_from: date })
}
