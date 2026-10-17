import type { SupabaseClient } from '@supabase/supabase-js'
import { check } from './api'
import { isTimedBlock } from './logging'
import { plannedSets } from './prescription'
import type { DayType, FeatRef, Prescription, SessionStatus } from './types'

export interface CalendarSessionRow {
  id: string
  date: string
  name: string
  day_type: DayType
  status: SessionStatus
  is_deload: boolean
  week: number | null
  session_exercises: { exercise_id?: string; prescription: Prescription; skipped: boolean; sets: { count: number }[] }[]
}

/** How a day looks on the calendar. */
export type DayState = 'done' | 'partial' | 'in_progress' | 'missed' | 'skipped' | 'planned' | 'today'

export interface CalendarDay {
  id: string
  date: string
  name: string
  dayType: DayType
  isDeload: boolean
  week: number | null
  state: DayState
  planned: number
  logged: number
  /** Feats the day's exercises build toward, most-trained first. */
  feats: FeatRef[]
}

export async function loadCalendar(db: SupabaseClient, from: string, to: string): Promise<CalendarSessionRow[]> {
  return check<CalendarSessionRow[]>(
    await db
      .from('sessions')
      .select('id, date, name, day_type, status, is_deload, week, session_exercises(exercise_id, prescription, skipped, sets(count))')
      .gte('date', from)
      .lte('date', to)
      .order('date'),
  )
}

/** Planned set count for a session: timed blocks count as one. */
export function plannedCount(items: CalendarSessionRow['session_exercises']): number {
  return items
    .filter((i) => !i.skipped)
    .reduce((n, i) => n + (isTimedBlock(i.prescription) ? 1 : plannedSets(i.prescription).length), 0)
}

/** Which feats each exercise builds toward, by exercise id. */
export async function loadExerciseFeats(db: SupabaseClient): Promise<Record<string, FeatRef[]>> {
  const out: Record<string, FeatRef[]> = {}
  for (const l of check<{ exercise_id: string; feat: FeatRef }[]>(
    await db.from('exercise_feats').select('exercise_id, feat:feats(id, slug, name)'),
  )) {
    ;(out[l.exercise_id] ??= []).push(l.feat)
  }
  return out
}

/** Feats a session's exercises build, most-trained first. */
export function featsOf(items: CalendarSessionRow['session_exercises'], links: Record<string, FeatRef[]>): FeatRef[] {
  const count = new Map<string, { feat: FeatRef; n: number }>()
  for (const i of items) {
    if (i.skipped || !i.exercise_id) continue
    for (const f of links[i.exercise_id] ?? []) count.set(f.id, { feat: f, n: (count.get(f.id)?.n ?? 0) + 1 })
  }
  return [...count.values()].sort((a, b) => b.n - a.n || a.feat.name.localeCompare(b.feat.name)).map((c) => c.feat)
}

export function summarize(row: CalendarSessionRow, today: string, links: Record<string, FeatRef[]> = {}): CalendarDay {
  const logged = row.session_exercises.reduce((n, i) => n + (i.sets[0]?.count ?? 0), 0)
  let state: DayState
  if (row.status === 'done') state = 'done'
  else if (row.status === 'partial') state = 'partial'
  else if (row.status === 'skipped') state = 'skipped'
  else if (row.status === 'in_progress' || logged > 0) state = row.date < today ? 'partial' : 'in_progress'
  else if (row.date < today) state = 'missed'
  else if (row.date === today) state = 'today'
  else state = 'planned'
  return {
    id: row.id,
    date: row.date,
    name: row.name,
    dayType: row.day_type,
    isDeload: row.is_deload,
    week: row.week,
    state,
    planned: plannedCount(row.session_exercises),
    logged,
    feats: featsOf(row.session_exercises, links),
  }
}
