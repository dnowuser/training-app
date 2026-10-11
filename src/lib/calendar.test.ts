import { describe, expect, it } from 'vitest'
import { plannedCount, summarize, type CalendarSessionRow } from './calendar'

const row = (patch: Partial<CalendarSessionRow>): CalendarSessionRow => ({
  id: 's',
  date: '2026-10-12',
  name: 'Hard',
  day_type: 'hard',
  status: 'planned',
  is_deload: false,
  week: 1,
  session_exercises: [
    { prescription: { minutes: 3 }, skipped: false, sets: [{ count: 0 }] },
    { prescription: { sets: 3, reps: 5 }, skipped: false, sets: [{ count: 0 }] },
    { prescription: { sets: 2, reps: 15 }, skipped: true, sets: [{ count: 0 }] },
  ],
  ...patch,
})

describe('calendar', () => {
  it('counts planned sets, timed blocks as one, skipped as none', () => {
    expect(plannedCount(row({}).session_exercises)).toBe(4)
  })

  it('works out the state of a day', () => {
    expect(summarize(row({}), '2026-10-11').state).toBe('planned')
    expect(summarize(row({}), '2026-10-12').state).toBe('today')
    expect(summarize(row({}), '2026-10-13').state).toBe('missed')
    expect(summarize(row({ status: 'done' }), '2026-10-13').state).toBe('done')
    const started = row({ session_exercises: [{ prescription: { sets: 3 }, skipped: false, sets: [{ count: 2 }] }] })
    expect(summarize(started, '2026-10-12')).toMatchObject({ state: 'in_progress', logged: 2, planned: 3 })
    expect(summarize(started, '2026-10-14').state).toBe('partial')
  })
})
