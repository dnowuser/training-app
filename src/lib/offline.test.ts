import { describe, expect, it } from 'vitest'
import type { NewSet } from './api'
import { enqueue, flushQueue, isNetworkError, queuedAsLogged, readQueue } from './offline'
import type { LoggedSet } from './types'

function memory() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  }
}

const set = (n: number): NewSet => ({
  session_exercise_id: 'se1',
  set_number: n,
  is_warmup: false,
  hit_target: true,
  reps: 5,
  load_lb: 225,
})

describe('offline set queue', () => {
  it('sends queued sets in order and empties the queue', async () => {
    const store = memory()
    enqueue({ tempId: 'a', set: set(1), queuedAt: '' }, store)
    enqueue({ tempId: 'b', set: set(2), queuedAt: '' }, store)
    const sent: number[] = []
    const result = await flushQueue(async (s) => {
      sent.push(s.set_number)
      return {} as LoggedSet
    }, store)
    expect(sent).toEqual([1, 2])
    expect(result).toMatchObject({ synced: 2, remaining: 0 })
    expect(readQueue(store)).toEqual([])
  })

  it('keeps the rest when the connection drops', async () => {
    const store = memory()
    enqueue({ tempId: 'a', set: set(1), queuedAt: '' }, store)
    enqueue({ tempId: 'b', set: set(2), queuedAt: '' }, store)
    const result = await flushQueue(async (s) => {
      if (s.set_number === 2) throw new Error('TypeError: Failed to fetch')
      return {} as LoggedSet
    }, store)
    expect(result).toMatchObject({ synced: 1, remaining: 1 })
    expect(readQueue(store).map((q) => q.tempId)).toEqual(['b'])
  })

  it('shows queued sets as pending rows with blanks as null', () => {
    const [row] = queuedAsLogged([{ tempId: 'queued-1', set: { ...set(1), load_lb: undefined }, queuedAt: 'now' }])
    expect(row).toMatchObject({ id: 'queued-1', reps: 5, load_lb: null, note: null })
  })

  it('tells network errors from server errors', () => {
    expect(isNetworkError(new Error('TypeError: Failed to fetch'))).toBe(true)
    expect(isNetworkError(new Error('Load failed'))).toBe(true)
    expect(isNetworkError(new Error('new row violates row-level security policy'))).toBe(false)
  })
})
