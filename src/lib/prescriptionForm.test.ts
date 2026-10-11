import { describe, expect, it } from 'vitest'
import { fromFormValues, parseLadder, toFormValues } from './prescriptionForm'

describe('prescription form', () => {
  it('round-trips a ladder', () => {
    const ladder = {
      scheme: 'ladder' as const,
      warmups: [{ pct: 40, reps: 5 }],
      steps: [
        { pct: 79, reps: 5 },
        { pct: 96, reps: 1 },
      ],
      rest_s: 180,
    }
    const form = toFormValues(ladder)
    expect(form.steps).toBe('79x5, 96x1')
    expect(fromFormValues(form)).toEqual(ladder)
  })

  it('drops blanks and keeps flags', () => {
    const form = toFormValues({ sets: 3, reps: 10 })
    form.numbers.reps_max = '12'
    form.numbers.sets = ''
    form.perSide = true
    expect(fromFormValues(form)).toEqual({ reps: 10, reps_max: 12, per_side: true })
  })

  it('rejects bad input', () => {
    const form = toFormValues({})
    form.numbers.sets = 'three'
    expect(fromFormValues(form)).toBe('Sets must be a number.')
    expect(parseLadder('79%x5, 86 × 3')).toEqual([
      { pct: 79, reps: 5 },
      { pct: 86, reps: 3 },
    ])
    expect(parseLadder('heavy')).toBeNull()
  })
})
