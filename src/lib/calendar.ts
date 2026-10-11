import type { SupabaseClient } from '@supabase/supabase-js'
import { check } from './api'
import { isTimedBlock } from './logging'
import { plannedSets } from './prescription'
import type { DayType, Prescription, SessionStatus } from './types'

export interface CalendarSessionRow {
  id: string
  date: string
  name: string
  day_type: DayType
  status: SessionStatus
  is_deload: boolean
  week: number | null
  session_exercises: { prescription: Prescription; skipped: boolean; sets: { count: number }[] }[]
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
}

export async function loadCalendar(db: SupabaseClient, from: string, to: string): Promise<CalendarSessionRow[]> {
  return check<CalendarSessionRow[]>(
    await db
      .from('sessions')
      .select('id, date, name, day_type, status, is_deload, week, session_exercises(prescription, skipped, sets(count))')
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

export function summarize(row: CalendarSessionRow, today: string): CalendarDay {
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
  }
}
