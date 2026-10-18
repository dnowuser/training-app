import type { SupabaseClient } from '@supabase/supabase-js'
import { cacheDay, loadDay } from './api'
import { addDays, localISODate, startOfWeek } from './dates'
import { loadPlan } from './overview'

const DAYS_AHEAD = 7
const KEY = 'prefetched-at'
const EVERY_MS = 30 * 60 * 1000

/**
 * Load the coming days (and this week's plan) while there's signal, so they open
 * at the gym without it. The day copies go to localStorage; every read also lands
 * in the service worker's saved data. At most every half hour; failures are fine.
 */
export async function prefetch(db: SupabaseClient, now = new Date()): Promise<void> {
  try {
    const last = Number(localStorage.getItem(KEY) ?? 0)
    if (now.getTime() - last < EVERY_MS) return
    localStorage.setItem(KEY, String(now.getTime()))
  } catch {
    // No storage: still worth warming the service worker's copy.
  }
  const today = localISODate(now)
  for (let i = -1; i <= DAYS_AHEAD; i++) {
    const date = addDays(today, i)
    try {
      cacheDay(date, await loadDay(db, date))
    } catch {
      return // lost signal: try again next time
    }
  }
  const monday = startOfWeek(today)
  await loadPlan(db, monday, addDays(monday, 6)).catch(() => undefined)
}
