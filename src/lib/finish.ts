import type { SupabaseClient } from '@supabase/supabase-js'
import { loadDay, recordTrainingMax, type Day } from './api'
import { addDays } from './dates'
import { plannedSets } from './prescription'
import { topPlannedSet, trainingMaxUpdate } from './progression'

/** Saved on the server: not still sending or waiting in the offline queue. */
const isSaved = (id: string) => !id.startsWith('pending-') && !id.startsWith('queued-')

/**
 * After a heavy ladder session, move each lift's training max by how its top
 * set went (see trainingMaxUpdate). Takes effect from the next day so that day's
 * loads don't shift; running it again for the same session doesn't move it twice.
 * Returns a line per lift for the screen.
 */
export async function applyTrainingMaxes(db: SupabaseClient, day: Day, sessionId: string): Promise<string[]> {
  const session = day.sessions.find((s) => s.id === sessionId)
  if (!session) return []
  const notes: string[] = []
  for (const item of day.exercises.filter((e) => e.session_id === sessionId)) {
    if (item.prescription.scheme !== 'ladder' || item.skipped) continue
    const tm = day.trainingMaxes.get(item.exercise_id)
    if (!tm) continue
    const top = topPlannedSet(plannedSets(item.prescription, tm))
    if (!top) continue // light day (no 96% single): the training max stays put
    const logged = day.sets.find((s) => s.session_exercise_id === item.id && s.set_number === top.setNumber && isSaved(s.id))
    const update = trainingMaxUpdate(tm, item.exercise.slug, logged, top.reps ?? 1, session.is_deload)
    const name = item.exercise.name
    if (!update) {
      notes.push(`${name}: training max stays ${tm} lb${logged?.rpe ? ` (top set RPE ${logged.rpe})` : ''}.`)
      continue
    }
    const saved = await recordTrainingMax(db, item.exercise, update.to, addDays(session.date, 1), `Auto: ${update.reason}`)
    notes.push(
      saved
        ? `${name}: training max ${update.from} → ${update.to} lb next time (${update.reason}).`
        : `${name}: training max already updated for this session.`,
    )
  }
  return notes
}

/** For a session finished offline: load its day fresh and apply the training max change. */
export async function applyTrainingMaxesLater(db: SupabaseClient, date: string, sessionId: string): Promise<void> {
  await applyTrainingMaxes(db, await loadDay(db, date), sessionId)
}
