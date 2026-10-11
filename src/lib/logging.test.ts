import { describe, expect, it } from 'vitest'
import {
  defaultValues,
  describeLogged,
  describeTarget,
  hitTarget,
  isTimedBlock,
  latestTrainingMaxes,
  needsInput,
  restAfter,
  withLadderStep,
} from './logging'
import { plannedSets } from './prescription'

const ladder = plannedSets(
  {
    scheme: 'ladder',
    warmups: [{ pct: 40, reps: 5 }],
    steps: [{ pct: 79, reps: 5 }],
    rest_s: 180,
  },
  300,
)

const nullSet = { reps: null, load_lb: null, seconds: null, distance_m: null, contacts: null }

describe('defaultValues', () => {
  it('logs the ladder target in one tap', () => {
    expect(defaultValues(ladder[1], 'load_reps')).toEqual({ load_lb: 235, reps: 5 })
    expect(needsInput('load_reps', defaultValues(ladder[1], 'load_reps'))).toBe(false)
  })

  it('carries the load forward when the plan has none', () => {
    const [set] = plannedSets({ sets: 4, reps: 3, reps_max: 5 })
    expect(needsInput('load_reps', defaultValues(set, 'load_reps'))).toBe(true)
    expect(defaultValues(set, 'load_reps', 45)).toEqual({ load_lb: 45, reps: 3 })
  })

  it('keeps only the fields the measure asks for', () => {
    const [run] = plannedSets({ sets: 5, distance_m: 400, target_seconds: 90 })
    expect(defaultValues(run, 'distance')).toEqual({ distance_m: 400, seconds: 90 })
    const [hold] = plannedSets({ sets: 4, seconds: 8, seconds_max: 12 })
    expect(defaultValues(hold, 'hold')).toEqual({ seconds: 8 })
  })
})

describe('hitTarget', () => {
  it('needs the target load and reps', () => {
    expect(hitTarget(ladder[1], 'load_reps', { load_lb: 235, reps: 5 })).toBe(true)
    expect(hitTarget(ladder[1], 'load_reps', { load_lb: 235, reps: 4 })).toBe(false)
    expect(hitTarget(ladder[1], 'load_reps', { load_lb: 230, reps: 6 })).toBe(false)
  })

  it('uses the low end of a range', () => {
    const [hold] = plannedSets({ sets: 4, seconds: 8, seconds_max: 12 })
    expect(hitTarget(hold, 'hold', { seconds: 8 })).toBe(true)
    expect(hitTarget(hold, 'hold', { seconds: 7 })).toBe(false)
  })

  it('treats target time as a ceiling', () => {
    const [run] = plannedSets({ sets: 5, distance_m: 400, target_seconds: 90 })
    expect(hitTarget(run, 'distance', { distance_m: 400, seconds: 88 })).toBe(true)
    expect(hitTarget(run, 'distance', { distance_m: 400, seconds: 93 })).toBe(false)
  })

  it('ignores targets the measure does not log', () => {
    const [set] = plannedSets({ sets: 2, reps: 15 })
    expect(hitTarget(set, 'reps', { reps: 15 })).toBe(true)
  })
})

describe('describeTarget', () => {
  it('reads like the plan', () => {
    expect(describeTarget(ladder[1])).toBe('235 lb × 5')
    expect(describeTarget(plannedSets({ scheme: 'ladder', steps: [{ pct: 79, reps: 5 }] })[0])).toBe('79% × 5')
    expect(describeTarget(plannedSets({ sets: 2, reps: 15, per_side: true })[0])).toBe('15 reps / side')
    expect(describeTarget(plannedSets({ sets: 4, seconds: 8, seconds_max: 12 })[0])).toBe('8–12 s')
    expect(describeTarget(plannedSets({ sets: 5, distance_m: 400, target_seconds: 90 })[0])).toBe('400 m in 1:30')
    expect(describeTarget(plannedSets({ contacts: 8, contacts_max: 12 })[0])).toBe('8–12 contacts')
  })
})

describe('describeLogged', () => {
  it('shows what was hit', () => {
    expect(describeLogged({ ...nullSet, load_lb: 235, reps: 5 })).toBe('235 lb × 5')
    expect(describeLogged({ ...nullSet, reps: 12 })).toBe('12 reps')
    expect(describeLogged({ ...nullSet, distance_m: 400, seconds: 88 })).toBe('400 m 1:28')
    expect(describeLogged({ ...nullSet, seconds: 600 })).toBe('10:00')
    expect(describeLogged(nullSet)).toBe('Done')
  })
})

describe('helpers', () => {
  it('spots timed blocks', () => {
    expect(isTimedBlock({ minutes: 10 })).toBe(true)
    expect(isTimedBlock({ sets: 3, reps: 5 })).toBe(false)
  })

  it('keeps the newest training max per exercise', () => {
    const tms = latestTrainingMaxes([
      { exercise_id: 'squat', value: 310 },
      { exercise_id: 'squat', value: 300 },
      { exercise_id: 'bench', value: 225 },
    ])
    expect(tms.get('squat')).toBe(310)
    expect(tms.get('bench')).toBe(225)
  })

  it('shortens rest after warm-ups and skips it for jumps', () => {
    const p = { scheme: 'ladder' as const, rest_s: 180 }
    expect(restAfter(p, ladder[0])).toBe(90)
    expect(restAfter(p, ladder[1])).toBe(180)
    expect(restAfter({ contacts: 8, rest_s: 90 }, undefined)).toBe(0)
  })
})

describe('withLadderStep', () => {
  const card = { sets: 3, reps: 5, reps_max: 8, rest_s: 120 }

  it('uses the step\'s sets and reps when it has them', () => {
    expect(withLadderStep(card, { target: { sets: 3, reps: 10 } })).toEqual({ sets: 3, reps: 10, rest_s: 120 })
    expect(withLadderStep({ ...card, deload: true }, { target: { sets: 3, reps: 10 } }).sets).toBe(2)
  })

  it('leaves goal-only steps and missing steps alone', () => {
    expect(withLadderStep(card, { target: { seconds: 15 } })).toBe(card)
    expect(withLadderStep(card, undefined)).toBe(card)
  })
})
