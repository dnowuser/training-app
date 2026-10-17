import { formatDuration, type PlannedSet } from './prescription'
import type { FeatStep, LoggedSet, Measure, Prescription } from './types'

/** The numbers you can log for a set. Which ones the app asks for depends on the exercise's measure. */
export interface SetValues {
  reps?: number
  load_lb?: number
  seconds?: number
  distance_m?: number
  contacts?: number
}

export type SetField = keyof SetValues

/** Fields to ask for, in display order, for each measure. */
export const MEASURE_FIELDS: Record<Measure, SetField[]> = {
  load_reps: ['load_lb', 'reps'],
  reps: ['reps'],
  hold: ['seconds'],
  distance: ['distance_m', 'seconds'],
  load_distance: ['load_lb', 'distance_m'],
  contacts: ['contacts'],
  duration: ['seconds'],
}

export const FIELD_LABELS: Record<SetField, string> = {
  load_lb: 'lb',
  reps: 'reps',
  seconds: 'sec',
  distance_m: 'm',
  contacts: 'contacts',
}

/** Tap size of the − / + buttons for each field. */
export const FIELD_STEP: Record<SetField, number> = {
  load_lb: 5,
  reps: 1,
  seconds: 5,
  distance_m: 5,
  contacts: 1,
}

/** Timed blocks (warm-up flows, handstand practice, zone 2) have no sets; they're logged once as done. */
export function isTimedBlock(p: Prescription): boolean {
  return p.minutes !== undefined && p.sets === undefined && p.contacts === undefined && p.scheme !== 'ladder'
}

/**
 * What one tap logs for a planned set: the target, limited to the fields the
 * measure asks for. `carryLoad` fills a load the plan doesn't give (e.g. weighted
 * pull-ups) from the previous set of the same exercise.
 */
export function defaultValues(planned: PlannedSet, measure: Measure, carryLoad?: number): SetValues {
  const all: SetValues = {
    reps: planned.reps,
    load_lb: planned.loadLb ?? carryLoad,
    seconds: planned.seconds ?? planned.targetSeconds,
    distance_m: planned.distanceM,
    contacts: planned.contacts,
  }
  const out: SetValues = {}
  for (const f of MEASURE_FIELDS[measure]) if (all[f] !== undefined) out[f] = all[f]
  return out
}

/** One tap is enough unless the set needs a load the plan doesn't give. */
export function needsInput(measure: Measure, values: SetValues): boolean {
  return MEASURE_FIELDS[measure].includes('load_lb') && values.load_lb === undefined
}

/**
 * Whether the logged values meet the planned set: at least the target reps, load,
 * hold, distance and contacts (the low end of a range), and no slower than the
 * target time for a run. Targets the measure doesn't log are ignored.
 */
export function hitTarget(planned: PlannedSet, measure: Measure, v: SetValues): boolean {
  const fields = MEASURE_FIELDS[measure]
  const atLeast = (field: SetField, target: number | undefined) =>
    !fields.includes(field) || target === undefined || (v[field] ?? -Infinity) >= target
  if (!atLeast('reps', planned.reps)) return false
  if (!atLeast('load_lb', planned.loadLb)) return false
  if (!atLeast('distance_m', planned.distanceM)) return false
  if (!atLeast('contacts', planned.contacts)) return false
  if (planned.targetSeconds !== undefined) {
    if (fields.includes('seconds') && (v.seconds === undefined || v.seconds > planned.targetSeconds)) return false
  } else if (!atLeast('seconds', planned.seconds)) {
    return false
  }
  return true
}

function range(low: number | undefined, high: number | undefined): string {
  if (low === undefined) return ''
  return high !== undefined && high !== low ? `${low}–${high}` : `${low}`
}

/** Target for one planned set, e.g. "235 lb × 5", "8–12 s", "400 m in 1:30". */
export function describeTarget(s: PlannedSet): string {
  const side = s.perSide ? ' / side' : ''
  if (s.contacts !== undefined) return `${range(s.contacts, s.contactsMax)} contacts`
  const parts: string[] = []
  if (s.loadLb !== undefined) parts.push(`${s.loadLb} lb`)
  else if (s.pct !== undefined) parts.push(`${s.pct}%`)
  if (s.reps !== undefined) parts.push(`${parts.length ? '× ' : ''}${range(s.reps, s.repsMax)}${parts.length ? '' : ' reps'}`)
  if (s.seconds !== undefined) parts.push(`${range(s.seconds, s.secondsMax)} s`)
  if (s.distanceM !== undefined) parts.push(`${s.distanceM} m`)
  if (s.targetSeconds !== undefined) parts.push(`in ${formatDuration(s.targetSeconds)}`)
  return parts.length ? parts.join(' ') + side : 'Set'
}

/** What was logged, e.g. "235 lb × 5", "12 s", "400 m · 1:28". */
export function describeLogged(s: Pick<LoggedSet, 'reps' | 'load_lb' | 'seconds' | 'distance_m' | 'contacts'>): string {
  // Numeric columns can arrive as strings ("400.0"); normalise first.
  const n = (v: number | string | null | undefined) => (v === null || v === undefined ? null : Number(v))
  const [load, distance, seconds] = [n(s.load_lb), n(s.distance_m), n(s.seconds)]
  const parts: string[] = []
  if (s.contacts != null) parts.push(`${s.contacts} contacts`)
  if (load !== null) parts.push(`${load} lb`)
  if (s.reps != null) parts.push(load !== null ? `× ${s.reps}` : `${s.reps} reps`)
  if (distance !== null) parts.push(`${distance} m`)
  if (seconds !== null) {
    parts.push(distance !== null || seconds >= 120 ? formatDuration(seconds) : `${seconds} s`)
  }
  const pace = distance !== null && seconds !== null ? pacePerMile(distance, seconds) : null
  if (pace !== null && distance! >= 400) parts.push(`· ${formatDuration(pace)}/mi`)
  return parts.join(' ') || 'Done'
}

export const METERS_PER_MILE = 1609.344

/** Seconds per mile for a run, or null without both distance and time. */
export function pacePerMile(distanceM: number, seconds: number): number | null {
  if (!(distanceM > 0) || !(seconds > 0)) return null
  return (seconds / distanceM) * METERS_PER_MILE
}

/** Total seconds for a distance run at a pace given in seconds per mile. */
export function timeFromPace(distanceM: number, secondsPerMile: number): number {
  return Math.round((secondsPerMile * distanceM) / METERS_PER_MILE)
}

/** Latest training max per exercise from metrics rows sorted newest first. */
export function latestTrainingMaxes(rows: { exercise_id: string | null; value: number }[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const r of rows) if (r.exercise_id && !out.has(r.exercise_id)) out.set(r.exercise_id, Number(r.value))
  return out
}

/**
 * Seconds to rest after a set: the prescription's rest, capped at 90 s after a
 * warm-up. No timer for jump contacts, whose rest is between jumps, not after the block.
 */
export function restAfter(p: Prescription, planned: PlannedSet | undefined): number {
  if (!p.rest_s || p.contacts !== undefined) return 0
  return planned?.isWarmup ? Math.min(p.rest_s, 90) : p.rest_s
}

/**
 * When the current ladder step sets its own sets and reps (e.g. "Pike push-ups,
 * 3 x 8"), the session follows the step rather than the template's generic range.
 * Steps that only give a goal (a 15 s hold to move up) leave the prescription alone.
 */
export function withLadderStep(p: Prescription, step: Pick<FeatStep, 'target'> | undefined): Prescription {
  const t = step?.target as { sets?: number; reps?: number } | undefined
  if (!t || typeof t.sets !== 'number' || typeof t.reps !== 'number' || p.scheme === 'ladder') return p
  const sets = p.deload ? Math.ceil(t.sets / 2) : t.sets
  const out: Prescription = { ...p, sets, reps: t.reps }
  delete out.sets_max
  delete out.reps_max
  return out
}
