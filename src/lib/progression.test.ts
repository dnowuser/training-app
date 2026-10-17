import { describe, expect, it } from 'vitest'
import { plannedSets } from './prescription'
import { describeLastTime, groupHistory, nextLoad, readyToMoveUp, topPlannedSet, trainingMaxUpdate, type PastSet } from './progression'

const set = (patch: Partial<PastSet>): PastSet => ({
  set_number: 1,
  is_warmup: false,
  reps: null,
  load_lb: null,
  seconds: null,
  distance_m: null,
  rpe: null,
  hit_target: true,
  ...patch,
})

describe('trainingMaxUpdate', () => {
  const top = (rpe: number | null, reps = 1, hit = true) => ({ reps, rpe, hit_target: hit })

  it('moves the bench max by 5 and squat/deadlift by 10 for an easy top single', () => {
    expect(trainingMaxUpdate(215, 'bench-press', top(7), 1, false)?.to).toBe(220)
    expect(trainingMaxUpdate(265, 'back-squat', top(6), 1, false)?.to).toBe(275)
  })

  it('takes half a step when solid or when no RPE was logged', () => {
    expect(trainingMaxUpdate(215, 'bench-press', top(8), 1, false)?.to).toBe(217.5)
    expect(trainingMaxUpdate(345, 'deadlift', top(null), 1, false)?.to).toBe(350)
  })

  it('holds when hard and backs off after a miss or a max effort', () => {
    expect(trainingMaxUpdate(215, 'bench-press', top(9), 1, false)).toBeNull()
    expect(trainingMaxUpdate(265, 'back-squat', top(null, 0, false), 1, false)?.to).toBe(260)
    expect(trainingMaxUpdate(265, 'back-squat', top(10), 1, false)?.to).toBe(260)
  })

  it('leaves deload weeks and missing top sets alone', () => {
    expect(trainingMaxUpdate(215, 'bench-press', top(6), 1, true)).toBeNull()
    expect(trainingMaxUpdate(215, 'bench-press', undefined, 1, false)).toBeNull()
  })
})

describe('accessory progression', () => {
  const p = { sets: 3, reps: 12, reps_max: 15 }

  it('adds weight when every set hit the top of the range', () => {
    const last = { date: '2026-10-13', sets: [15, 15, 15].map((reps) => set({ reps, load_lb: 25 })) }
    expect(nextLoad(p, last)).toEqual({ load: 30, note: 'hit 15 on every set last time: +5 lb' })
  })

  it('keeps the weight otherwise', () => {
    const last = { date: '2026-10-13', sets: [15, 14, 12].map((reps) => set({ reps, load_lb: 25 })) }
    expect(nextLoad(p, last)?.load).toBe(25)
    expect(nextLoad({ sets: 3, reps: 5, pct_tm: 75 }, last)).toBeNull()
  })

  it('describes last time compactly', () => {
    const last = {
      date: '2026-10-13',
      sets: [set({ reps: 15, load_lb: 25 }), set({ set_number: 2, reps: 14, load_lb: 25, rpe: 8.5 })],
    }
    expect(describeLastTime(last)).toBe('25 lb × 15, 14 · RPE 8.5')
  })
})

describe('ladder readiness', () => {
  const session = (date: string, hit: boolean) => ({ date, sets: [set({ hit_target: hit })] })

  it('needs three sessions in a row on target', () => {
    expect(readyToMoveUp([session('c', true), session('b', true), session('a', true)])).toBe(true)
    expect(readyToMoveUp([session('c', true), session('b', false), session('a', true)])).toBe(false)
    expect(readyToMoveUp([session('b', true), session('a', true)])).toBe(false)
  })

  it('groups log rows into sessions, newest first', () => {
    const rows = [
      { ...set({ set_number: 2 }), date: '2026-10-13', exercise_slug: 'x' },
      { ...set({}), date: '2026-10-13', exercise_slug: 'x' },
      { ...set({}), date: '2026-10-20', exercise_slug: 'x' },
    ]
    const h = groupHistory(rows)
    expect(h.x.map((s) => s.date)).toEqual(['2026-10-20', '2026-10-13'])
    expect(h.x[1].sets.map((s) => s.set_number)).toEqual([1, 2])
  })
})

describe('topPlannedSet', () => {
  const warmups = [
    { pct: 33, reps: 10 },
    { pct: 56, reps: 10 },
  ]

  it('is the 96% single even when 91% singles follow it', () => {
    const full = plannedSets(
      {
        scheme: 'ladder',
        warmups,
        steps: [79, 86, 91, 96, 91, 91].map((pct, i) => ({ pct, reps: i === 0 ? 5 : i === 1 ? 3 : 1 })),
      },
      215,
    )
    expect(topPlannedSet(full)).toMatchObject({ pct: 96, setNumber: 6, loadLb: 205 })
  })

  it('is none on the light day, so the training max stays put', () => {
    const light = plannedSets({ scheme: 'ladder', warmups, steps: [91, 91, 91].map((pct) => ({ pct, reps: 1 })) }, 215)
    expect(topPlannedSet(light)).toBeUndefined()
  })
})
