import { describe, expect, it } from 'vitest'
import { swapOptions } from './swap'
import type { Exercise } from './types'

const ex = (id: string, muscle_detail: string[], area: Exercise['area'] = 'accessory') =>
  ({ id, slug: id, name: id, area, muscle_detail }) as Exercise

describe('swapOptions', () => {
  const facePull = ex('face-pull', ['rear delts', 'mid traps', 'infraspinatus'])
  const library = [
    facePull,
    ex('cable-rear-delt-fly', ['rear delts', 'mid traps']),
    ex('reverse-pec-deck', ['rear delts', 'rhomboids']),
    ex('chest-supported-row', ['lats', 'mid traps', 'rear delts']),
    ex('bench-press', ['mid chest', 'front delts']),
    ex('sleeper-stretch', ['infraspinatus', 'rear delts'], 'mobility'),
  ]

  it('ranks exercises sharing the main movers, closest first', () => {
    expect(swapOptions(facePull, library).map((o) => o.exercise.id)).toEqual([
      'cable-rear-delt-fly',
      'reverse-pec-deck',
      'chest-supported-row',
    ])
  })

  it('lists the shared muscles, never the exercise itself or a stretch for a lift', () => {
    const [best] = swapOptions(facePull, library)
    expect(best.shared).toEqual(['rear delts', 'mid traps'])
    expect(swapOptions(facePull, library).some((o) => o.exercise.area === 'mobility')).toBe(false)
  })

  it('has nothing to offer without muscle data', () => {
    expect(swapOptions(ex('mystery', []), library)).toEqual([])
  })
})
