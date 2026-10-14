import { describe, expect, it } from 'vitest'
import { toCsv } from './exportData'

describe('toCsv', () => {
  it('writes a header and quotes awkward values', () => {
    const csv = toCsv([
      { date: '2026-10-12', exercise: 'Back squat', set_note: 'felt "heavy", slow', load_lb: 255 },
      { date: '2026-10-13', exercise: 'Bench press', set_note: null, load_lb: 205 },
    ])
    expect(csv.split('\n')).toEqual([
      'date,exercise,set_note,load_lb',
      '2026-10-12,Back squat,"felt ""heavy"", slow",255',
      '2026-10-13,Bench press,,205',
    ])
  })
})
