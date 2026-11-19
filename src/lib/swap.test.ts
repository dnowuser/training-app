import { describe, expect, it } from 'vitest'
import { searchSwaps, swapOptions } from './swap'
import type { Exercise } from './types'

const ex = (id: string, muscle_detail: string[], area: Exercise['area'] = 'accessory', name = id) =>
  ({ id, slug: id, name, area, muscle_detail }) as Exercise

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
    // A row is led by the lats, not the rear delts, so it isn't offered for a face pull.
    expect(swapOptions(facePull, library).map((o) => o.exercise.id)).toEqual(['cable-rear-delt-fly', 'reverse-pec-deck'])
  })

  it('lists the shared muscles, never the exercise itself or a stretch for a lift', () => {
    const [best] = swapOptions(facePull, library)
    expect(best.shared).toEqual(['rear delts', 'mid traps'])
    expect(swapOptions(facePull, library).some((o) => o.exercise.area === 'mobility')).toBe(false)
  })

  it('puts the same movement first: rows for a row', () => {
    const row = ex('chest-supported-row', ['lats', 'mid traps', 'rhomboids', 'rear delts', 'biceps'], 'accessory', 'Chest-supported row')
    const lib = [
      row,
      ex('weighted-pull-up', ['lats', 'teres major', 'biceps'], 'calisthenics', 'Weighted pull-up'),
      ex('cable-row', ['mid traps', 'lats', 'rhomboids'], 'accessory', 'Seated cable row'),
      ex('t-bar', ['lats', 'mid traps', 'erector spinae'], 'lifting', 'T-bar row'),
      ex('rear-fly', ['rear delts', 'mid traps', 'rhomboids'], 'accessory', 'Cable rear delt fly'),
    ]
    expect(swapOptions(row, lib).slice(0, 2).map((o) => o.exercise.id).sort()).toEqual(['cable-row', 't-bar'])
  })

  it('never suggests a different movement led by another muscle: no muscle-up for a curl', () => {
    const curl = ex('incline-curl', ['biceps', 'brachialis'], 'accessory', 'Incline dumbbell curl')
    const lib = [
      curl,
      ex('muscle-up', ['lats', 'biceps', 'triceps long head'], 'calisthenics', 'Muscle-up'),
      ex('preacher-curl', ['biceps', 'brachialis'], 'accessory', 'Preacher curl'),
      ex('chin-up', ['biceps', 'lats'], 'calisthenics', 'Weighted chin-up'),
    ]
    expect(swapOptions(curl, lib).map((o) => o.exercise.id)).toEqual(['preacher-curl', 'chin-up'])
  })

  it('searches the whole library by name', () => {
    const curl = ex('incline-curl', ['biceps'], 'accessory', 'Incline dumbbell curl')
    const lib = [curl, ex('a', [], 'accessory', 'Preacher curl'), ex('b', [], 'accessory', 'Hammer curl'), ex('c', [], 'lifting', 'Back squat')]
    expect(searchSwaps(curl, lib, 'curl').map((e) => e.name)).toEqual(['Hammer curl', 'Preacher curl'])
    expect(searchSwaps(curl, lib, 'pre').map((e) => e.name)).toEqual(['Preacher curl'])
  })

  it('has nothing to offer without muscle data', () => {
    expect(swapOptions(ex('mystery', []), library)).toEqual([])
  })
})
