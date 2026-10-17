import type { SupabaseClient } from '@supabase/supabase-js'
import { check } from './api'
import { groupHistory, type PastSession, type PastSet } from './progression'
import type { Exercise, FeatRef, Prescription } from './types'

export type LibraryExercise = Exercise & { feats: FeatRef[] }

export interface ExerciseDetail {
  exercise: LibraryExercise
  /** Where it sits in the weekly plan. */
  plan: { weekday: number; day: string; prescription: Prescription; notes: string | null }[]
  /** Your sessions with it, newest first. */
  history: PastSession[]
}

const WITH_FEATS = '*, links:exercise_feats(feat:feats(id, slug, name))'

type Row = Exercise & { links: { feat: FeatRef }[] }
const withFeats = ({ links, ...e }: Row): LibraryExercise => ({ ...e, feats: links.map((l) => l.feat) })

export async function loadLibrary(db: SupabaseClient): Promise<LibraryExercise[]> {
  return check<Row[]>(await db.from('exercises').select(WITH_FEATS).order('name')).map(withFeats)
}

export async function loadExercise(db: SupabaseClient, slug: string): Promise<ExerciseDetail> {
  const exercise = withFeats(check<Row>(await db.from('exercises').select(WITH_FEATS).eq('slug', slug).single()))
  const [plan, log] = await Promise.all([
    db
      .from('template_items')
      .select('prescription, notes, max_week, slot:template_slots(weekday, name)')
      .eq('exercise_id', exercise.id),
    db
      .from('session_log')
      .select('date, exercise_slug, set_number, is_warmup, reps, load_lb, seconds, distance_m, rpe, hit_target')
      .eq('exercise_slug', slug)
      .not('set_id', 'is', null)
      .order('date', { ascending: false })
      .limit(300),
  ])
  type PlanRow = { prescription: Prescription; notes: string | null; max_week: number | null; slot: { weekday: number; name: string } }
  return {
    exercise,
    plan: check<PlanRow[]>(plan)
      .filter((p) => p.max_week !== 0) // retired items are kept with max_week 0
      .map((p) => ({ weekday: p.slot.weekday, day: p.slot.name, prescription: p.prescription, notes: p.notes }))
      .sort((a, b) => a.weekday - b.weekday),
    history: groupHistory(check<(PastSet & { date: string; exercise_slug: string })[]>(log))[slug] ?? [],
  }
}

/** A how-to video search for an exercise. */
export function videoSearchUrl(name: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} exercise how to`)}`
}
