import type { SupabaseClient } from '@supabase/supabase-js'
import { isNetworkError } from './offline'

/**
 * Changes made without signal, other than new sets (those use the set queue in
 * offline.ts): an edited set, an RPE, a skipped exercise, a session started or
 * finished, or a training max to work out once a finished session's sets are in.
 * Sent in order after the set queue.
 */
export type OutboxOp =
  | { kind: 'update'; table: 'sets' | 'sessions' | 'session_exercises'; id: string; patch: Record<string, unknown> }
  | { kind: 'delete'; table: 'sets'; id: string }
  | { kind: 'training-max'; date: string; sessionId: string }

export interface OutboxItem {
  id: string
  op: OutboxOp
  queuedAt: string
}

const KEY = 'outbox'
export const OUTBOX_EVENT = 'outbox-changed'

type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
function storage(): KV | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function readOutbox(store: KV | null = storage()): OutboxItem[] {
  try {
    const raw = store?.getItem(KEY)
    return raw ? (JSON.parse(raw) as OutboxItem[]) : []
  } catch {
    return []
  }
}

function write(items: OutboxItem[], store: KV | null) {
  try {
    if (items.length) store?.setItem(KEY, JSON.stringify(items))
    else store?.removeItem(KEY)
  } catch {
    // Storage full or blocked: nothing more we can do offline.
  }
  globalThis.dispatchEvent?.(new Event(OUTBOX_EVENT))
}

/** Add a change. Two updates to the same row merge, so the latest values win and only one request goes out. */
export function addToOutbox(op: OutboxOp, store: KV | null = storage(), now = new Date().toISOString()) {
  const items = readOutbox(store)
  if (op.kind === 'update') {
    const same = items.find((i) => i.op.kind === 'update' && i.op.table === op.table && i.op.id === op.id)
    if (same && same.op.kind === 'update') {
      same.op.patch = { ...same.op.patch, ...op.patch }
      return write(items, store)
    }
  }
  if (op.kind === 'delete') {
    // Deleting a row makes its pending updates moot.
    const rest = items.filter((i) => !(i.op.kind === 'update' && i.op.table === op.table && i.op.id === op.id))
    return write([...rest, { id: crypto.randomUUID(), op, queuedAt: now }], store)
  }
  write([...items, { id: crypto.randomUUID(), op, queuedAt: now }], store)
}

/**
 * Send the outbox in order. Stops at the first network error and keeps the rest.
 * `trainingMax` works out and records a finished session's training max change.
 */
export async function flushOutbox(
  db: SupabaseClient,
  trainingMax: (date: string, sessionId: string) => Promise<void>,
  store: KV | null = storage(),
): Promise<{ sent: number; remaining: number; error?: string }> {
  let sent = 0
  let error: string | undefined
  for (const item of readOutbox(store)) {
    try {
      const op = item.op
      if (op.kind === 'update') {
        const { error: e } = await db.from(op.table).update(op.patch).eq('id', op.id)
        if (e) throw new Error(e.message)
      } else if (op.kind === 'delete') {
        const { error: e } = await db.from(op.table).delete().eq('id', op.id)
        if (e) throw new Error(e.message)
      } else {
        await trainingMax(op.date, op.sessionId)
      }
      sent += 1
      write(
        readOutbox(store).filter((i) => i.id !== item.id),
        store,
      )
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
      if (isNetworkError(e)) break
    }
  }
  return { sent, remaining: readOutbox(store).length, error }
}

/** The outbox's pending changes laid over rows loaded from a saved copy, so the screen shows what you did. */
export function applyOutbox<T extends { id: string }>(
  rows: T[],
  table: 'sets' | 'sessions' | 'session_exercises',
  items: OutboxItem[] = readOutbox(),
): T[] {
  let out = rows
  for (const { op } of items) {
    if (op.kind === 'update' && op.table === table) out = out.map((r) => (r.id === op.id ? { ...r, ...op.patch } : r))
    if (op.kind === 'delete' && op.table === table) out = out.filter((r) => r.id !== op.id)
  }
  return out
}
