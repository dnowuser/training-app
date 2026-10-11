import type { SupabaseClient } from '@supabase/supabase-js'
import { latestTrainingMaxes, type SetValues } from './logging'
import { groupHistory, type PastSession, type PastSet } from './progression'
import type { Exercise, FeatStep, LoggedSet, Session, SessionExercise } from './types'

export type DaySession = Session & { slot: { mobility: string | null } | null }
export type DayExercise = SessionExercise & { exercise: Exercise }

/** A feat ladder an exercise practises, with its steps in order. */
export interface Ladder {
  id: string
  name: string
  slug: string
  steps: FeatStep[]
}

export interface Day {
  /** Generated session first, then any extras added by hand. */
  sessions: DaySession[]
  exercises: DayExercise[]
  sets: LoggedSet[]
  /** Latest training max on or before the date, by exercise id. */
  trainingMaxes: Map<string, number>
  /** Ladders for the day's skill exercises, by feat id. */
  ladders: Record<string, Ladder>
  /** Earlier sessions of each of the day's exercises (before this date), newest first, by slug. */
  history: Record<string, PastSession[]>
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
  if (sessions.length === 0) return { sessions, exercises: [], sets: [], trainingMaxes: new Map(), ladders: {}, history: {} }

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
  const featIds = [...new Set(exercises.flatMap((e) => (e.exercise.feat_id ? [e.exercise.feat_id] : [])))]

  const slugs = [...new Set(exercises.map((e) => e.exercise.slug))]

  const [sets, maxes, feats, past] = await Promise.all([
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
    featIds.length ? db.from('feats').select('id, name, slug, steps:feat_steps(*)').in('id', featIds) : { data: [], error: null },
    slugs.length
      ? db
          .from('session_log')
          .select('date, exercise_slug, set_number, is_warmup, reps, load_lb, seconds, distance_m, rpe, hit_target')
          .not('set_id', 'is', null)
          .in('exercise_slug', slugs)
          .lt('date', date)
          .order('date', { ascending: false })
          .limit(500)
      : { data: [], error: null },
  ])
  const ladders: Record<string, Ladder> = {}
  for (const f of check<Ladder[]>(feats)) ladders[f.id] = { ...f, steps: [...f.steps].sort((a, b) => a.step_number - b.step_number) }

  return {
    sessions,
    exercises,
    sets: check<LoggedSet[]>(sets),
    trainingMaxes: latestTrainingMaxes(check<{ exercise_id: string | null; value: number }[]>(maxes)),
    ladders,
    history: groupHistory(
      check<(PastSet & { date: string; exercise_slug: string })[]>(past).map((r) => ({
        ...r,
        reps: r.reps === null ? null : Number(r.reps),
        load_lb: r.load_lb === null ? null : Number(r.load_lb),
        seconds: r.seconds === null ? null : Number(r.seconds),
        distance_m: r.distance_m === null ? null : Number(r.distance_m),
        rpe: r.rpe === null ? null : Number(r.rpe),
      })),
    ),
  }
}

export interface NewSet extends SetValues {
  session_exercise_id: string
  set_number: number
  is_warmup: boolean
  hit_target: boolean
  rpe?: number | null
  note?: string | null
}

export async function insertSet(db: SupabaseClient, set: NewSet): Promise<LoggedSet> {
  return check<LoggedSet>(await db.from('sets').insert(set).select().single())
}

export async function updateSetRpe(db: SupabaseClient, id: string, rpe: number | null): Promise<LoggedSet> {
  return check<LoggedSet>(await db.from('sets').update({ rpe }).eq('id', id).select().single())
}

/**
 * Record a new training max, effective from `from` (the day after the session
 * that earned it, so that day's loads don't shift), with a change-log row.
 */
export async function recordTrainingMax(
  db: SupabaseClient,
  exercise: Exercise,
  value: number,
  from: string,
  reason: string,
): Promise<boolean> {
  const existing = check<{ id: string }[]>(
    await db.from('metrics').select('id').eq('kind', 'training_max').eq('exercise_id', exercise.id).eq('measured_on', from),
  )
  if (existing.length) return false
  check(await db.from('metrics').insert({ kind: 'training_max', exercise_id: exercise.id, value, unit: 'lb', measured_on: from, note: reason }))
  check(
    await db.from('changes').insert({
      author: 'app',
      summary: `${exercise.name} training max set to ${value} lb`,
      reason,
      affects_from: from,
      details: {},
    }),
  )
  return true
}

export async function updateSet(
  db: SupabaseClient,
  id: string,
  patch: SetValues & { hit_target: boolean; note?: string | null; rpe?: number | null },
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
    rpe: patch.rpe ?? null,
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
    return { ...parsed, ladders: parsed.ladders ?? {}, history: parsed.history ?? {}, trainingMaxes: new Map(parsed.trainingMaxes) }
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
