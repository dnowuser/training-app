import { describe, expect, it } from 'vitest'
import { weekSummary, type WeekReview } from './review'

describe('weekSummary', () => {
  it('lists days, misses and notes', () => {
    const w: WeekReview = {
      start: '2026-10-12',
      end: '2026-10-18',
      days: [
        { id: '1', date: '2026-10-12', name: 'Hard: jumps and squat', dayType: 'hard', isDeload: false, week: 1, state: 'done', planned: 30, logged: 30, feats: [] },
      ],
      sets: [
        {
          date: '2026-10-12',
          exercise: 'Back squat',
          exercise_slug: 'back-squat',
          set_number: 7,
          is_warmup: false,
          reps: 0,
          load_lb: 255,
          seconds: null,
          distance_m: null,
          contacts: null,
          hit_target: false,
          set_note: 'Missed the top single, sleep was bad',
        },
      ],
      notes: [],
    }
    const text = weekSummary(w)
    expect(text).toContain('Hard: jumps and squat: done, 30/30 sets')
    expect(text).toContain('Back squat set 7: 255 lb × 0')
    expect(text).toContain('sleep was bad')
  })
})
