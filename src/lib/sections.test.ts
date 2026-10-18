import { describe, expect, it } from 'vitest'
import type { DayExercise } from './api'
import { sectionsOf } from './sections'

const item = (id: string, block: DayExercise['block'], group: string | null = null) =>
  ({ id, block, exercise: { group_name: group } }) as unknown as DayExercise

describe('sectionsOf', () => {
  it('splits by block and folds consecutive drills of a group', () => {
    const s = sectionsOf([
      item('a', 'warmup'),
      item('b', 'accessory'),
      item('c', 'accessory', 'Foot work'),
      item('d', 'accessory', 'Foot work'),
      item('e', 'accessory'),
      item('f', 'mobility'),
    ])
    expect(s.map((x) => x.block)).toEqual(['warmup', 'accessory', 'mobility'])
    expect(s[1].groups.map((g) => [g.name, g.items.map((i) => i.id)])).toEqual([
      [null, ['b']],
      ['Foot work', ['c', 'd']],
      [null, ['e']],
    ])
  })
})
