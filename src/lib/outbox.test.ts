import { describe, expect, it } from 'vitest'
import { addToOutbox, applyOutbox, flushOutbox, readOutbox } from './outbox'

function memory() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
}

describe('outbox', () => {
  it('merges updates to the same row and drops them when the row is deleted', () => {
    const store = memory()
    addToOutbox({ kind: 'update', table: 'sets', id: 's1', patch: { rpe: 8 } }, store)
    addToOutbox({ kind: 'update', table: 'sets', id: 's1', patch: { reps: 5 } }, store)
    expect(readOutbox(store)).toHaveLength(1)
    expect(readOutbox(store)[0].op).toMatchObject({ patch: { rpe: 8, reps: 5 } })
    addToOutbox({ kind: 'delete', table: 'sets', id: 's1' }, store)
    expect(readOutbox(store).map((i) => i.op.kind)).toEqual(['delete'])
  })

  it('lays pending changes over loaded rows', () => {
    const store = memory()
    addToOutbox({ kind: 'update', table: 'sessions', id: 'a', patch: { status: 'done' } }, store)
    addToOutbox({ kind: 'delete', table: 'sets', id: 'x' }, store)
    const items = readOutbox(store)
    expect(applyOutbox([{ id: 'a', status: 'planned' }], 'sessions', items)).toEqual([{ id: 'a', status: 'done' }])
    expect(applyOutbox([{ id: 'x' }, { id: 'y' }], 'sets', items)).toEqual([{ id: 'y' }])
  })

  it('sends in order, runs training-max work, and keeps the rest after a network error', async () => {
    const store = memory()
    addToOutbox({ kind: 'update', table: 'sessions', id: 'a', patch: { status: 'done' } }, store)
    addToOutbox({ kind: 'training-max', date: '2026-10-19', sessionId: 'a' }, store)
    addToOutbox({ kind: 'update', table: 'sets', id: 'b', patch: { rpe: 9 } }, store)
    const calls: string[] = []
    let fail = false
    const db = {
      from: (table: string) => ({
        update: (patch: object) => ({
          eq: async (_: string, id: string) => {
            if (fail) throw new Error('Failed to fetch')
            calls.push(`${table}:${id}:${JSON.stringify(patch)}`)
            return { error: null }
          },
        }),
      }),
    }
    const tm: string[] = []
    const result = await flushOutbox(db as never, async (date, id) => {
      tm.push(`${date}:${id}`)
      fail = true
    }, store)
    expect(calls).toEqual(['sessions:a:{"status":"done"}'])
    expect(tm).toEqual(['2026-10-19:a'])
    expect(result).toMatchObject({ sent: 2, remaining: 1 })
  })
})
