import { describe, expect, it } from 'vitest'
import { addDays, addMonths, monthGrid, startOfWeek } from './dates'

describe('dates', () => {
  it('adds days across month ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31')
  })

  it('finds the Monday of the week', () => {
    expect(startOfWeek('2026-10-11')).toBe('2026-10-05') // Sunday belongs to the week before
    expect(startOfWeek('2026-10-12')).toBe('2026-10-12')
  })

  it('builds whole Monday-first weeks for a month', () => {
    const days = monthGrid('2026-10')
    expect(days[0]).toBe('2026-09-28')
    expect(days.at(-1)).toBe('2026-11-01')
    expect(days.length % 7).toBe(0)
  })

  it('shifts months', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
  })
})
