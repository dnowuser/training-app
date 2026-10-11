import { describe, expect, it } from 'vitest'
import { e1rmSeries, estimatedMax, formatSeconds, holdSeries, metricSeries, parseTime, weeklySets, type LogRow } from './progress'

const row = (patch: Partial<LogRow>): LogRow => ({
  date: '2026-10-12',
  exercise_slug: 'back-squat',
  measure: 'load_reps',
  is_warmup: false,
  reps: null,
  load_lb: null,
  seconds: null,
  distance_m: null,
  ...patch,
})

describe('progress', () => {
  it('estimates a max from reps up to 10', () => {
    expect(estimatedMax(225, 5)).toBe(263)
    expect(estimatedMax(255, 1)).toBe(255)
    expect(estimatedMax(135, 15)).toBeNull()
  })

  it('takes the best work set per day and ignores warm-ups', () => {
    const log = [
      row({ load_lb: 210, reps: 2, is_warmup: true }),
      row({ load_lb: 210, reps: 5 }),
      row({ load_lb: 255, reps: 1 }),
      row({ date: '2026-10-19', load_lb: 225, reps: 5 }),
    ]
    expect(e1rmSeries(log, 'back-squat')).toEqual([
      { x: '2026-10-12', y: 255 },
      { x: '2026-10-19', y: 263 },
    ])
  })

  it('takes the longest hold per day', () => {
    const log = [row({ exercise_slug: 'front-lever', seconds: 8 }), row({ exercise_slug: 'front-lever', seconds: 12 })]
    expect(holdSeries(log, 'front-lever')).toEqual([{ x: '2026-10-12', y: 12 }])
  })

  it('counts work sets per area per week', () => {
    const areas = new Map([['back-squat', 'lifting' as const]])
    const weeks = weeklySets(
      [row({ load_lb: 225, reps: 5 }), row({ load_lb: 225, reps: 5, is_warmup: true }), row({ date: '2026-10-05' })],
      areas,
      '2026-10-14',
      2,
    )
    expect(weeks.map((w) => w.week)).toEqual(['2026-10-05', '2026-10-12'])
    expect(weeks.map((w) => w.byArea.get('lifting'))).toEqual([1, 1])
  })

  it('keeps the last entry when a date has two', () => {
    const m = (value: number) => ({ id: '', kind: 'training_max', exercise_id: 'b', value, unit: 'lb' as const, measured_on: '2026-10-11', note: null })
    expect(metricSeries([m(220), m(215)], 'training_max', 'b')).toEqual([{ x: '2026-10-11', y: 215 }])
  })

  it('reads and writes times', () => {
    expect(parseTime('6:05')).toBe(365)
    expect(parseTime('1:02:30')).toBe(3750)
    expect(parseTime('90')).toBe(90)
    expect(parseTime('6:')).toBeNull()
    expect(formatSeconds(1420)).toBe('23:40')
  })
})
