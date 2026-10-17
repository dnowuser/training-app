import type { SupabaseClient } from '@supabase/supabase-js'
import { check } from './api'
import { addDays, parseISODate } from './dates'
import { isTimedBlock } from './logging'
import { plannedSets } from './prescription'
import type { Block, Prescription } from './types'

export interface WeekRow {
  date: string
  session_exercises: {
    prescription: Prescription
    block: Block
    skipped: boolean
    exercise: { muscles: string[] } | null
    sets: { count: number }[]
  }[]
}

export interface MuscleWeek {
  muscle: string
  /** Planned work sets Monday to Sunday. */
  byDay: number[]
  planned: number
  logged: number
  /** Days of the week it's trained. */
  days: number
}

export async function loadWeek(db: SupabaseClient, monday: string): Promise<WeekRow[]> {
  return check<WeekRow[]>(
    await db
      .from('sessions')
      .select('date, session_exercises(prescription, block, skipped, exercise:exercises(muscles), sets(count))')
      .gte('date', monday)
      .lte('date', addDays(monday, 6)),
  )
}

/** Work sets of an exercise: warm-up sets don't count, a timed block counts as one. */
function workSets(p: Prescription): number {
  if (isTimedBlock(p)) return 1
  return plannedSets(p).filter((s) => !s.isWarmup).length
}

/**
 * Sets per muscle for each day of the week. Warm-ups and stretching aren't
 * counted (they're not training the muscle), nor is skipped work.
 */
export function muscleWeek(rows: WeekRow[]): MuscleWeek[] {
  const map = new Map<string, MuscleWeek>()
  for (const row of rows) {
    const day = (parseISODate(row.date).getDay() + 6) % 7 // Monday = 0
    for (const se of row.session_exercises) {
      if (se.skipped || se.block === 'warmup' || se.block === 'mobility') continue
      const planned = workSets(se.prescription)
      const logged = se.sets[0]?.count ?? 0
      for (const muscle of se.exercise?.muscles ?? []) {
        const m = map.get(muscle) ?? { muscle, byDay: [0, 0, 0, 0, 0, 0, 0], planned: 0, logged: 0, days: 0 }
        m.byDay[day] += planned
        m.planned += planned
        m.logged += logged
        map.set(muscle, m)
      }
    }
  }
  for (const m of map.values()) m.days = m.byDay.filter((n) => n > 0).length
  return [...map.values()].sort((a, b) => b.planned - a.planned || a.muscle.localeCompare(b.muscle))
}

/** Words used for stretches and runs, drawn as the muscles they mean. */
export const ALIASES: Record<string, string[]> = {
  spine: ['lower back', 'upper back'],
  shoulders: ['front delts', 'rear delts'],
  hips: ['glutes', 'hip flexors'],
}

/** Spread aliases onto real regions, keeping the strongest level for each. */
export function regionLevels(level: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [muscle, v] of Object.entries(level)) {
    for (const m of ALIASES[muscle] ?? [muscle]) out[m] = Math.max(out[m] ?? 0, v)
  }
  return out
}

/** Shading for one exercise: its first two muscles are the main movers, the rest work less. */
export function exerciseLevels(muscles: string[]): Record<string, number> {
  return Object.fromEntries(muscles.map((m, i) => [m, i < 2 ? 1 : 0.55]))
}

/** Shading for a week: each muscle's sets relative to the most-trained one. */
export function weekLevels(week: MuscleWeek[], by: 'planned' | 'logged'): Record<string, number> {
  const max = Math.max(1, ...week.map((m) => m[by]))
  return Object.fromEntries(week.filter((m) => m[by] > 0).map((m) => [m.muscle, m[by] / max]))
}
