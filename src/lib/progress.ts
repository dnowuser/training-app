import type { SupabaseClient } from '@supabase/supabase-js'
import { check } from './api'
import { addDays, startOfWeek } from './dates'
import type { Area, Exercise, Measure, Metric, Milestone } from './types'

export interface Point {
  /** YYYY-MM-DD */
  x: string
  y: number
}

/** One logged set, as the progress charts need it (from the session_log view). */
export interface LogRow {
  date: string
  exercise_slug: string
  measure: Measure
  is_warmup: boolean | null
  reps: number | null
  load_lb: number | null
  seconds: number | null
  distance_m: number | null
}

export interface ProgressData {
  metrics: Metric[]
  log: LogRow[]
  exercises: Exercise[]
  milestones: Milestone[]
  sessions: { date: string; status: string }[]
}

export async function loadProgress(db: SupabaseClient, since: string): Promise<ProgressData> {
  const [metrics, log, exercises, milestones, sessions] = await Promise.all([
    db.from('metrics').select('*').order('measured_on').order('created_at'),
    db
      .from('session_log')
      .select('date, exercise_slug, measure, is_warmup, reps, load_lb, seconds, distance_m')
      .not('set_id', 'is', null)
      .order('date'),
    db.from('exercises').select('*'),
    db.from('milestones').select('*').order('achieved_on', { ascending: false }).limit(30),
    db.from('sessions').select('date, status').gte('date', since).order('date'),
  ])
  return {
    metrics: check<Metric[]>(metrics).map((m) => ({ ...m, value: Number(m.value) })),
    log: check<LogRow[]>(log).map((r) => ({
      ...r,
      reps: r.reps === null ? null : Number(r.reps),
      load_lb: r.load_lb === null ? null : Number(r.load_lb),
      seconds: r.seconds === null ? null : Number(r.seconds),
      distance_m: r.distance_m === null ? null : Number(r.distance_m),
    })),
    exercises: check<Exercise[]>(exercises),
    milestones: check<Milestone[]>(milestones),
    sessions: check<{ date: string; status: string }[]>(sessions),
  }
}

/** Estimated one-rep max (Epley). Only trusted up to 10 reps. */
export function estimatedMax(load: number, reps: number): number | null {
  if (reps < 1 || reps > 10 || load <= 0) return null
  return reps === 1 ? load : Math.round(load * (1 + reps / 30))
}

/** Best estimated max per day for one lift, from work sets. */
export function e1rmSeries(log: LogRow[], slug: string): Point[] {
  const best = new Map<string, number>()
  for (const r of log) {
    if (r.exercise_slug !== slug || r.is_warmup || r.load_lb === null || r.reps === null) continue
    const e = estimatedMax(r.load_lb, r.reps)
    if (e !== null && e > (best.get(r.date) ?? 0)) best.set(r.date, e)
  }
  return [...best].sort(([a], [b]) => a.localeCompare(b)).map(([x, y]) => ({ x, y }))
}

/** Longest hold per day for one exercise. */
export function holdSeries(log: LogRow[], slug: string): Point[] {
  const best = new Map<string, number>()
  for (const r of log) {
    if (r.exercise_slug !== slug || r.seconds === null) continue
    if (r.seconds > (best.get(r.date) ?? 0)) best.set(r.date, r.seconds)
  }
  return [...best].sort(([a], [b]) => a.localeCompare(b)).map(([x, y]) => ({ x, y }))
}

/** One point per date; when a date has several entries, the last one recorded wins (a correction). */
export function metricSeries(metrics: Metric[], kind: string, exerciseId?: string): Point[] {
  const byDate = new Map<string, number>()
  for (const m of metrics) {
    if (m.kind === kind && (exerciseId === undefined || m.exercise_id === exerciseId)) byDate.set(m.measured_on, m.value)
  }
  return [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([x, y]) => ({ x, y }))
}

/**
 * Work sets per area for each of the last `weeks` weeks (Monday to Sunday),
 * oldest first. Warm-ups don't count.
 */
export function weeklySets(
  log: LogRow[],
  areaBySlug: Map<string, Area>,
  today: string,
  weeks = 8,
): { week: string; byArea: Map<Area, number> }[] {
  const thisWeek = startOfWeek(today)
  const out = Array.from({ length: weeks }, (_, i) => ({
    week: addDays(thisWeek, -7 * (weeks - 1 - i)),
    byArea: new Map<Area, number>(),
  }))
  for (const r of log) {
    if (r.is_warmup) continue
    const bucket = out.find((w) => r.date >= w.week && r.date < addDays(w.week, 7))
    const area = areaBySlug.get(r.exercise_slug)
    if (!bucket || !area) continue
    bucket.byArea.set(area, (bucket.byArea.get(area) ?? 0) + 1)
  }
  return out
}

/** "6:05" for 365 s, "23:40" for 1420 s. Times over an hour show h:mm:ss. */
export function formatSeconds(total: number): string {
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = Math.round(total % 60)
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

/** Parse "6:05", "1:02:30" or plain seconds. */
export function parseTime(text: string): number | null {
  const parts = text.trim().split(':')
  if (!parts.length || parts.some((p) => p === '' || !/^\d+(\.\d+)?$/.test(p))) return null
  return parts.reduce((total, p) => total * 60 + Number(p), 0)
}
