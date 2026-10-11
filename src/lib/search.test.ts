import { describe, expect, it } from 'vitest'
import { cleanQuery, parseDateQuery } from './search'

describe('search', () => {
  it('cleans characters that break filters', () => {
    expect(cleanQuery('front (lever), 10*')).toBe('front lever 10')
  })

  it('reads dates', () => {
    expect(parseDateQuery('2026-10-12')).toBe('2026-10-12')
    expect(parseDateQuery('10/12', '2026-01-01')).toBe('2026-10-12')
    expect(parseDateQuery('2/30/2026')).toBeNull()
    expect(parseDateQuery('bench')).toBeNull()
  })
})
