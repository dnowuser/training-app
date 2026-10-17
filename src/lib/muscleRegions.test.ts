import { describe, expect, it } from 'vitest'
import { regionLevels } from '../lib/muscles'

describe('regionLevels', () => {
  it('draws stretch areas as the muscles they mean, keeping the strongest level', () => {
    expect(regionLevels({ spine: 0.5, 'lower back': 1, quads: 0.3 })).toEqual({
      'lower back': 1,
      'upper back': 0.5,
      quads: 0.3,
    })
  })
})

import { exerciseLevels, weekLevels } from './muscles'

describe('diagram shading', () => {
  it('shades the main movers fully and the rest lighter', () => {
    expect(exerciseLevels(['chest', 'front delts', 'triceps'])).toEqual({ chest: 1, 'front delts': 1, triceps: 0.55 })
  })

  it('scales a week by the most-trained muscle and leaves untrained ones out', () => {
    const week = [
      { muscle: 'quads', byDay: [], planned: 10, logged: 8, days: 2 },
      { muscle: 'calves', byDay: [], planned: 5, logged: 0, days: 1 },
    ]
    expect(weekLevels(week, 'planned')).toEqual({ quads: 1, calves: 0.5 })
    expect(weekLevels(week, 'logged')).toEqual({ quads: 1 })
  })
})
