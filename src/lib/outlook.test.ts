import { describe, expect, it } from 'vitest'
import { FEAT_MODELS, outlooks, projectLadder, projectMetric } from './outlook'

const metricModel = (slug: string) => {
  const m = FEAT_MODELS[slug]
  if (m.kind !== 'metric') throw new Error('not a metric')
  return m
}

describe('projectMetric', () => {
  it('reaches a 315 squat from a 265 training max in about 5 months', () => {
    const { eta, points } = projectMetric(metricModel('squat-315'), { x: '2026-10-18', y: 265 })
    expect(eta! > '2027-02-15' && eta! < '2027-04-15').toBe(true)
    expect(points.at(-1)!.y).toBe(315)
  })

  it('cuts mile time with shrinking gains', () => {
    const { points, eta } = projectMetric(metricModel('mile-sub-6'), { x: '2026-10-18', y: 450 })
    expect(points[1].y).toBeLessThan(450)
    expect(points[1].y - points[2].y).toBeGreaterThan(points[2].y - points[3].y)
    expect(eta).not.toBeNull()
  })

  it('gives up past the horizon rather than inventing a date', () => {
    expect(projectMetric(metricModel('bench-315'), { x: '2026-10-18', y: 100 }, 12).eta).toBeNull()
  })
})

describe('projectLadder', () => {
  it('spreads the remaining steps at the planned pace', () => {
    const steps = [1, 2, 3, 4].map((n) => ({ step_number: n, achieved_on: n === 1 ? '2026-10-20' : null }))
    const p = projectLadder(12, steps, '2026-10-12', '2026-10-25')
    expect(p.history.map((h) => h.y)).toEqual([0, 1])
    expect(p.projection.map((h) => h.y)).toEqual([1, 2, 3, 4])
    expect(p.eta! > '2027-07-01' && p.eta! < '2027-08-15').toBe(true)
  })
})

describe('outlooks', () => {
  it('uses a measurement when there is one and the ladder when not', () => {
    const feats = [
      { id: 'a', slug: 'bench-315', name: '315 bench', stage: 'now', steps: [{ step_number: 1, achieved_on: null }] },
      { id: 'b', slug: 'mile-sub-6', name: 'Sub-6:00 mile', stage: 'now', steps: [1, 2, 3, 4].map((n) => ({ step_number: n, achieved_on: null })) },
    ]
    const metrics = [
      { kind: 'training_max', value: 215, measured_on: '2026-10-11', exercise_slug: 'bench-press' },
      { kind: 'training_max', value: 220, measured_on: '2026-10-18', exercise_slug: 'bench-press' },
    ]
    const [bench, mile] = outlooks(feats, metrics, '2026-10-12', '2026-10-18')
    expect(bench.unit).toBe('lb')
    expect(bench.history.map((p) => p.y)).toEqual([215, 220])
    expect(bench.eta).not.toBeNull()
    expect(mile.unit).toBe('steps')
  })
})
