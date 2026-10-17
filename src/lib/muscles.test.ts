import { describe, expect, it } from 'vitest'
import { muscleWeek, type WeekRow } from './muscles'

describe('muscleWeek', () => {
  it('counts work sets per muscle per day, skipping warm-ups, stretches and skipped work', () => {
    const rows: WeekRow[] = [
      {
        date: '2026-10-19', // Monday
        session_exercises: [
          {
            prescription: { scheme: 'ladder', warmups: [{ pct: 33, reps: 10 }], steps: [{ pct: 79, reps: 5 }, { pct: 96, reps: 1 }] },
            block: 'strength',
            skipped: false,
            exercise: { muscles: ['quads', 'glutes'] },
            sets: [{ count: 3 }],
          },
          { prescription: { sets: 2, reps: 15 }, block: 'warmup', skipped: false, exercise: { muscles: ['glutes'] }, sets: [{ count: 0 }] },
          { prescription: { sets: 2, seconds: 40 }, block: 'mobility', skipped: false, exercise: { muscles: ['hamstrings'] }, sets: [{ count: 0 }] },
        ],
      },
      {
        date: '2026-10-24', // Saturday
        session_exercises: [
          { prescription: { sets: 3, reps: 8 }, block: 'accessory', skipped: false, exercise: { muscles: ['quads'] }, sets: [{ count: 0 }] },
          { prescription: { sets: 3, reps: 8 }, block: 'accessory', skipped: true, exercise: { muscles: ['quads'] }, sets: [{ count: 0 }] },
        ],
      },
    ]
    const week = muscleWeek(rows)
    expect(week.map((m) => m.muscle)).toEqual(['quads', 'glutes'])
    expect(week[0]).toMatchObject({ byDay: [2, 0, 0, 0, 0, 3, 0], planned: 5, logged: 3, days: 2 })
    expect(week[1]).toMatchObject({ planned: 2, days: 1 })
  })
})
