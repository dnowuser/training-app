import { describe, expect, it } from 'vitest'
import { cycleWeek, slugify } from './plan'

describe('plan helpers', () => {
  it('slugifies exercise names like the seed', () => {
    expect(slugify('Hip airplane (assisted)')).toBe('hip-airplane-assisted')
    expect(slugify('  ATG split squat ')).toBe('atg-split-squat')
  })

  it('finds the cycle week', () => {
    const cycle = { start_date: '2026-10-12', weeks: 12 }
    expect(cycleWeek(cycle, '2026-10-11')).toBeNull()
    expect(cycleWeek(cycle, '2026-10-12')).toBe(1)
    expect(cycleWeek(cycle, '2026-10-19')).toBe(2)
    expect(cycleWeek(cycle, '2027-01-03')).toBe(12)
    expect(cycleWeek(cycle, '2027-01-04')).toBeNull()
  })
})
