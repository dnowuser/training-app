import { describe, expect, it } from 'vitest'
import { addedSince, isDone, type Note } from './notes'

const note = (text: string, handled: string | null, doneOn: string | null = '2026-11-19'): Note => ({
  source: 'session',
  sourceId: 's',
  date: '2026-11-18',
  where: 'Session',
  text,
  status: { id: 'n', source: 'session', source_id: 's', done_on: doneOn, response: null, handled_text: handled },
})

describe('notes that grow after being marked done', () => {
  it('is done while nothing has been added', () => {
    expect(isDone(note('Deadlift: skip sets', 'Deadlift: skip sets'))).toBe(true)
    // Rows from before handled_text existed cover the whole note.
    expect(isDone(note('Deadlift: skip sets', null))).toBe(true)
  })

  it('opens again with just the new part once a line is added', () => {
    const n = note('Deadlift: skip sets\n\nCurl: need preacher curl', 'Deadlift: skip sets')
    expect(isDone(n)).toBe(false)
    expect(addedSince(n)).toBe('Curl: need preacher curl')
  })

  it('is open when never marked done', () => {
    expect(isDone(note('Anything', null, null))).toBe(false)
  })
})
