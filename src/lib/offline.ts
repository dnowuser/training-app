import type { NewSet } from './api'
import type { LoggedSet } from './types'

/** A set logged without signal, waiting to be sent. */
export interface QueuedSet {
  tempId: string
  set: NewSet
  queuedAt: string
}

const QUEUE_KEY = 'set-queue'
/** Fired on window whenever the queue changes, so screens can refresh. */
export const QUEUE_EVENT = 'set-queue-changed'

type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function storage(): KV | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function readQueue(store: KV | null = storage()): QueuedSet[] {
  try {
    const raw = store?.getItem(QUEUE_KEY)
    return raw ? (JSON.parse(raw) as QueuedSet[]) : []
  } catch {
    return []
  }
}

function writeQueue(queue: QueuedSet[], store: KV | null) {
  try {
    if (queue.length) store?.setItem(QUEUE_KEY, JSON.stringify(queue))
    else store?.removeItem(QUEUE_KEY)
  } catch {
    // Storage full or blocked: nothing more we can do offline.
  }
  globalThis.dispatchEvent?.(new Event(QUEUE_EVENT))
}

export function enqueue(item: QueuedSet, store: KV | null = storage()) {
  writeQueue([...readQueue(store), item], store)
}

/** Drop a queued set (undo before it was sent). */
export function dequeue(tempId: string, store: KV | null = storage()) {
  writeQueue(
    readQueue(store).filter((q) => q.tempId !== tempId),
    store,
  )
}

/** True when an error means "no connection" rather than "the server said no". */
export function isNetworkError(e: unknown): boolean {
  if (globalThis.navigator && globalThis.navigator.onLine === false) return true
  const message = e instanceof Error ? e.message : String(e)
  return /failed to fetch|load failed|network|fetch failed|timed? ?out/i.test(message)
}

/**
 * Send queued sets in order. Stops at the first network error and keeps the
 * rest for later. A set the server rejects for another reason stays queued too,
 * so nothing is silently lost; the banner keeps showing it.
 */
export async function flushQueue(
  insert: (set: NewSet) => Promise<LoggedSet>,
  store: KV | null = storage(),
): Promise<{ synced: number; remaining: number; error?: string }> {
  let synced = 0
  let error: string | undefined
  for (const item of readQueue(store)) {
    try {
      await insert(item.set)
      synced += 1
      writeQueue(
        readQueue(store).filter((q) => q.tempId !== item.tempId),
        store,
      )
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
      if (isNetworkError(e)) break
    }
  }
  return { synced, remaining: readQueue(store).length, error }
}

/** A set that hasn't been saved yet, shaped like a logged row so the screen can show it. */
export function pendingSet(id: string, set: NewSet, loggedAt: string): LoggedSet {
  return {
    id,
    session_exercise_id: set.session_exercise_id,
    set_number: set.set_number,
    side: null,
    is_warmup: set.is_warmup,
    reps: set.reps ?? null,
    load_lb: set.load_lb ?? null,
    seconds: set.seconds ?? null,
    distance_m: set.distance_m ?? null,
    contacts: set.contacts ?? null,
    rpe: set.rpe ?? null,
    hit_target: set.hit_target,
    note: set.note ?? null,
    logged_at: loggedAt,
  }
}

/** Queued sets shown as pending rows on a day's screen. */
export function queuedAsLogged(queue: QueuedSet[]): LoggedSet[] {
  return queue.map((q) => pendingSet(q.tempId, q.set, q.queuedAt))
}
