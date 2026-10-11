import type { PlannedSet } from './prescription'
import type { Prescription } from './types'

/** A set from an earlier session, as the progression rules need it. */
export interface PastSet {
  set_number: number
  is_warmup: boolean | null
  reps: number | null
  load_lb: number | null
  seconds: number | null
  distance_m: number | null
  rpe: number | null
  hit_target: boolean | null
}

/** One earlier session of an exercise, newest first in a list. */
export interface PastSession {
  date: string
  sets: PastSet[]
}

/** RPE values offered when logging (10 = nothing left, 9 = one more rep, 8 = two, ...). */
export const RPE_OPTIONS = [6, 7, 7.5, 8, 8.5, 9, 9.5, 10]

/** How training maxes move, in words, for the Plan screen. Keep in step with trainingMaxUpdate. */
export const TRAINING_MAX_RULE = [
  'After every heavy session, the top single sets the next training max:',
  'RPE 7 or easier: +5 lb bench, +10 lb squat and deadlift.',
  'RPE 7.5–8.5: half that.',
  'RPE 9–9.5: hold.',
  'RPE 10 or a missed rep: down half a step.',
  'Hit but no RPE logged: half a step up.',
  'Deload weeks never change it. The new max starts the next day.',
]

/** Upper-body lifts move in smaller steps than squat and deadlift. */
export function tmStep(slug: string): number {
  return /bench|press|row|pull/.test(slug) ? 5 : 10
}

export interface TmUpdate {
  from: number
  to: number
  reason: string
}

/**
 * New training max after a heavy ladder session, from how the top single went.
 * - Top single RPE 7 or lower: it was easy, so up a full step (+5 bench, +10 squat/deadlift).
 * - RPE 7.5 to 8.5: up half a step.
 * - RPE 9 to 9.5: about right; hold.
 * - RPE 10 or a missed rep: too heavy; down half a step.
 * - Hit but no RPE logged: up half a step (cautious).
 * Deload weeks and sessions without a top set leave it alone (null).
 */
export function trainingMaxUpdate(
  tm: number,
  slug: string,
  top: { reps: number | null; rpe: number | null; hit_target: boolean | null } | undefined,
  plannedReps: number,
  isDeload: boolean,
): TmUpdate | null {
  if (isDeload || !top) return null
  const step = tmStep(slug)
  const missed = top.hit_target === false || (top.reps !== null && top.reps < plannedReps)
  let change: number
  let reason: string
  if (missed) {
    change = -step / 2
    reason = 'top set missed'
  } else if (top.rpe === null) {
    change = step / 2
    reason = 'top set hit (no RPE logged)'
  } else if (top.rpe <= 7) {
    change = step
    reason = `top set felt easy (RPE ${top.rpe})`
  } else if (top.rpe <= 8.5) {
    change = step / 2
    reason = `top set solid (RPE ${top.rpe})`
  } else if (top.rpe < 10) {
    change = 0
    reason = `top set hard (RPE ${top.rpe}), holding`
  } else {
    change = -step / 2
    reason = 'top set was a max effort (RPE 10)'
  }
  if (change === 0) return null
  return { from: tm, to: tm + change, reason }
}

/** The ladder's top set: the last work set (highest percentage). */
export function topPlannedSet(planned: PlannedSet[]): PlannedSet | undefined {
  return planned.filter((s) => !s.isWarmup).at(-1)
}

/** "25 lb × 15, 15, 14 · RPE 8" for the work sets of a past session. */
export function describeLastTime(session: PastSession): string {
  const work = session.sets.filter((s) => !s.is_warmup)
  if (!work.length) return 'done'
  const loads = new Set(work.map((s) => s.load_lb))
  const sameLoad = loads.size === 1 && work[0].load_lb !== null
  const each = work.map((s) => {
    const parts: string[] = []
    if (!sameLoad && s.load_lb !== null) parts.push(`${Number(s.load_lb)} lb`)
    if (s.reps !== null) parts.push(sameLoad || s.load_lb === null ? `${s.reps}` : `× ${s.reps}`)
    if (s.seconds !== null) parts.push(`${Number(s.seconds)} s`)
    if (s.distance_m !== null && s.seconds === null) parts.push(`${Number(s.distance_m)} m`)
    return parts.join(' ') || '✓'
  })
  const head = sameLoad ? `${Number(work[0].load_lb)} lb × ` : ''
  const rpes = work.map((s) => s.rpe).filter((r): r is number => r !== null)
  const rpe = rpes.length ? ` · RPE ${Math.max(...rpes)}` : ''
  return `${head}${each.join(', ')}${rpe}`
}

/**
 * Double progression for weighted accessories: when every work set last time
 * reached the top of the rep range, add weight; otherwise keep the weight and
 * add reps. Returns the load to use and a short reason, or null without history.
 */
export function nextLoad(p: Prescription, last: PastSession | undefined, increment = 5): { load: number; note: string } | null {
  if (!last || p.scheme === 'ladder' || p.pct_tm !== undefined) return null
  const work = last.sets.filter((s) => !s.is_warmup && s.load_lb !== null)
  if (!work.length) return null
  const load = Math.max(...work.map((s) => Number(s.load_lb)))
  const top = p.reps_max ?? p.reps
  const allTop = top !== undefined && work.every((s) => (s.reps ?? 0) >= top)
  const tooHard = work.some((s) => s.rpe !== null && s.rpe >= 9.5)
  if (allTop && !tooHard) return { load: load + increment, note: `hit ${top} on every set last time: +${increment} lb` }
  return { load, note: 'same weight, aim for more reps' }
}

/**
 * Ready for the next ladder step: the last `n` sessions each hit every work set's target.
 */
export function readyToMoveUp(history: PastSession[], n = 3): boolean {
  const recent = history.slice(0, n)
  if (recent.length < n) return false
  return recent.every((s) => {
    const work = s.sets.filter((x) => !x.is_warmup)
    return work.length > 0 && work.every((x) => x.hit_target !== false)
  })
}

/** Group session_log rows (newest first) into sessions per exercise slug. */
export function groupHistory(rows: (PastSet & { date: string; exercise_slug: string })[]): Record<string, PastSession[]> {
  const out: Record<string, PastSession[]> = {}
  for (const r of rows) {
    const list = (out[r.exercise_slug] ??= [])
    let session = list.find((s) => s.date === r.date)
    if (!session) {
      session = { date: r.date, sets: [] }
      list.push(session)
    }
    session.sets.push(r)
  }
  for (const list of Object.values(out)) {
    list.sort((a, b) => b.date.localeCompare(a.date))
    for (const s of list) s.sets.sort((a, b) => a.set_number - b.set_number)
  }
  return out
}
