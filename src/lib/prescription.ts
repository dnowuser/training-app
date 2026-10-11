import type { Prescription } from './types'

/** Round to the nearest loadable weight (5 lb with standard plates). */
export function roundToPlate(lb: number, increment = 5): number {
  return Math.round(lb / increment) * increment
}

/** One planned set as the Today screen shows it, before anything is logged. */
export interface PlannedSet {
  setNumber: number
  isWarmup: boolean
  perSide: boolean
  /** Percent of training max, for ladder steps and pct_tm sets. */
  pct?: number
  reps?: number
  repsMax?: number
  loadLb?: number
  seconds?: number
  secondsMax?: number
  distanceM?: number
  targetSeconds?: number
  contacts?: number
  contactsMax?: number
}

/**
 * Expand a prescription into individual sets. Ladder and pct_tm loads need the
 * exercise's training max; without it the load is left blank for you to enter.
 * Timed blocks (minutes only) return no sets: they're logged as done.
 */
export function plannedSets(p: Prescription, trainingMax?: number): PlannedSet[] {
  const load = (pct: number) => (trainingMax ? roundToPlate((trainingMax * pct) / 100) : undefined)
  const perSide = Boolean(p.per_side)

  if (p.scheme === 'ladder') {
    const warmups = (p.warmups ?? []).map((s) => ({ ...s, isWarmup: true }))
    const work = (p.steps ?? []).map((s) => ({ ...s, isWarmup: false }))
    return [...warmups, ...work].map((s, i) => ({
      setNumber: i + 1,
      isWarmup: s.isWarmup,
      perSide,
      pct: s.pct,
      reps: s.reps,
      loadLb: load(s.pct),
    }))
  }

  if (p.contacts !== undefined) {
    return [{ setNumber: 1, isWarmup: false, perSide, contacts: p.contacts, contactsMax: p.contacts_max }]
  }

  if (!p.sets) return []

  const loadLb = p.pct_tm !== undefined ? load(p.pct_tm) : p.load_lb
  return Array.from({ length: p.sets }, (_, i) => ({
    setNumber: i + 1,
    isWarmup: false,
    perSide,
    pct: p.pct_tm,
    reps: p.reps,
    repsMax: p.reps_max,
    loadLb,
    seconds: p.seconds,
    secondsMax: p.seconds_max,
    distanceM: p.distance_m,
    targetSeconds: p.target_seconds,
  }))
}

/** 90 -> "1:30", 1530 -> "25:30". */
export function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = Math.round(totalSeconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatRest(seconds: number): string {
  if (seconds <= 90) return `${seconds} s`
  if (seconds % 60 === 0) return `${seconds / 60} min`
  return formatDuration(seconds)
}

function range(low: number | undefined, high: number | undefined, unit = ''): string {
  if (low === undefined) return ''
  return high !== undefined && high !== low ? `${low}–${high}${unit}` : `${low}${unit}`
}

/** One-line summary of a prescription, e.g. "3 x 12–15 · 60 s rest". */
export function describePrescription(p: Prescription, trainingMax?: number): string {
  let main = ''
  if (p.scheme === 'ladder') {
    main = (p.steps ?? []).map((s) => `${s.pct}% x ${s.reps}`).join(', ')
  } else if (p.minutes !== undefined) {
    main = range(p.minutes, p.minutes_max, ' min')
  } else if (p.contacts !== undefined) {
    main = `${range(p.contacts, p.contacts_max)} contacts`
  } else if (p.sets !== undefined) {
    const sets = range(p.sets, p.sets_max)
    const work =
      p.reps !== undefined
        ? range(p.reps, p.reps_max)
        : p.seconds !== undefined
          ? range(p.seconds, p.seconds_max, ' s')
          : p.distance_m !== undefined
            ? `${p.distance_m} m`
            : ''
    main = work ? `${sets} x ${work}` : `${sets} sets`
  }
  if (main && p.per_side) main += ' per side'

  const parts = [main]
  if (p.pct_tm !== undefined) {
    parts.push(trainingMax ? `${roundToPlate((trainingMax * p.pct_tm) / 100)} lb` : `${p.pct_tm}% TM`)
  }
  if (p.load_lb !== undefined) parts.push(`${p.load_lb} lb`)
  if (p.target_seconds !== undefined) parts.push(`${formatDuration(p.target_seconds)} each`)
  if (p.intensity) parts.push(p.intensity)
  if (p.rest_s) parts.push(`${formatRest(p.rest_s)} rest`)
  if (p.deload) parts.push('deload')
  return parts.filter(Boolean).join(' · ')
}
