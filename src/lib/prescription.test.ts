import { describe, expect, it } from 'vitest'
import { describePrescription, formatDuration, plannedSets, roundToPlate } from './prescription'
import type { Prescription } from './types'

const ladder: Prescription = {
  scheme: 'ladder',
  warmups: [
    { pct: 40, reps: 5 },
    { pct: 55, reps: 3 },
    { pct: 70, reps: 2 },
  ],
  steps: [
    { pct: 79, reps: 5 },
    { pct: 86, reps: 3 },
    { pct: 91, reps: 1 },
    { pct: 96, reps: 1 },
  ],
  rest_s: 180,
}

describe('roundToPlate', () => {
  it('rounds to the nearest 5 lb', () => {
    expect(roundToPlate(237)).toBe(235)
    expect(roundToPlate(258)).toBe(260)
    expect(roundToPlate(272.6)).toBe(275)
  })
})

describe('plannedSets', () => {
  it('expands the ladder off a 300 lb training max', () => {
    const sets = plannedSets(ladder, 300)
    expect(sets.map((s) => s.loadLb)).toEqual([120, 165, 210, 235, 260, 275, 290])
    expect(sets.map((s) => s.reps)).toEqual([5, 3, 2, 5, 3, 1, 1])
    expect(sets.filter((s) => s.isWarmup)).toHaveLength(3)
  })

  it('leaves loads blank without a training max', () => {
    expect(plannedSets(ladder).every((s) => s.loadLb === undefined)).toBe(true)
  })

  it('works out percentage back-off sets', () => {
    const sets = plannedSets({ sets: 3, reps: 5, pct_tm: 75 }, 300)
    expect(sets).toHaveLength(3)
    expect(sets[0].loadLb).toBe(225)
  })

  it('treats jumps as one block of contacts and timed work as done/not done', () => {
    expect(plannedSets({ contacts: 8, contacts_max: 12 })).toHaveLength(1)
    expect(plannedSets({ minutes: 10 })).toEqual([])
  })
})

describe('describePrescription', () => {
  it('summarises common shapes', () => {
    expect(describePrescription({ sets: 3, reps: 12, reps_max: 15, rest_s: 60 })).toBe('3 x 12–15 · 60 s rest')
    expect(describePrescription({ sets: 2, reps: 15, per_side: true })).toBe('2 x 15 per side')
    expect(describePrescription({ minutes: 2, minutes_max: 3 })).toBe('2–3 min')
    expect(describePrescription({ contacts: 8, contacts_max: 12, rest_s: 90, intensity: 'max intent' })).toBe(
      '8–12 contacts · max intent · 90 s rest',
    )
    expect(describePrescription({ sets: 5, sets_max: 6, distance_m: 400, target_seconds: 90, rest_s: 150 })).toBe(
      '5–6 x 400 m · 1:30 each · 2:30 rest',
    )
    expect(describePrescription({ sets: 4, sets_max: 5, seconds: 8, seconds_max: 12, rest_s: 120 })).toBe(
      '4–5 x 8–12 s · 2 min rest',
    )
  })

  it('shows loads when the training max is known', () => {
    expect(describePrescription({ sets: 3, reps: 5, pct_tm: 75 })).toBe('3 x 5 · 75% TM')
    expect(describePrescription({ sets: 3, reps: 5, pct_tm: 75 }, 300)).toBe('3 x 5 · 225 lb')
    expect(describePrescription(ladder)).toBe('79% x 5, 86% x 3, 91% x 1, 96% x 1 · 3 min rest')
  })
})

describe('formatDuration', () => {
  it('formats minutes and seconds', () => {
    expect(formatDuration(90)).toBe('1:30')
    expect(formatDuration(1530)).toBe('25:30')
  })
})
