import { useEffect, useState } from 'react'
import { insertSet } from '../lib/api'
import { applyTrainingMaxesLater } from '../lib/finish'
import { flushQueue, QUEUE_EVENT, readQueue } from '../lib/offline'
import { flushOutbox, OUTBOX_EVENT, readOutbox } from '../lib/outbox'
import { prefetch } from '../lib/prefetch'
import { supabase } from '../lib/supabase'

/**
 * Sends what was saved on the phone without signal (sets first, then other
 * changes) as soon as there's a connection, keeps the next days saved for
 * offline use, and says when the app is offline or has changes waiting.
 */
export function SyncBanner() {
  const [waiting, setWaiting] = useState(() => readQueue().length + readOutbox().length)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    const db = supabase
    let running = false
    const flush = async () => {
      if (running || !navigator.onLine) return
      running = true
      try {
        const sets = readQueue().length ? await flushQueue((set) => insertSet(db, set)) : { remaining: 0, error: undefined }
        // Other changes wait until every set is in, so a finished session's training max sees them.
        const other = !sets.remaining && readOutbox().length ? await flushOutbox(db, (date, id) => applyTrainingMaxesLater(db, date, id)) : null
        setError((sets.remaining && sets.error) || (other?.remaining && other.error) || null)
      } finally {
        running = false
      }
    }
    const count = () => setWaiting(readQueue().length + readOutbox().length)
    const onOnline = () => {
      setOnline(true)
      void flush().then(() => prefetch(db))
    }
    const onOffline = () => setOnline(false)
    window.addEventListener(QUEUE_EVENT, count)
    window.addEventListener(OUTBOX_EVENT, count)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    void flush()
    // Keep the coming days saved for the gym, once the screen has settled.
    const warm = setTimeout(() => navigator.onLine && void prefetch(db), 3000)
    const id = setInterval(() => void flush(), 30_000)
    return () => {
      window.removeEventListener(QUEUE_EVENT, count)
      window.removeEventListener(OUTBOX_EVENT, count)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      clearTimeout(warm)
      clearInterval(id)
    }
  }, [])

  if (!waiting && online) return null
  return (
    <p className="mx-4 mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-sm">
      {!online && <span className="block font-medium">Offline. Showing what was last saved; changes are kept on this phone.</span>}
      {waiting > 0 && (
        <span className="block">
          {waiting} {waiting === 1 ? 'change' : 'changes'} saved on this phone, waiting for signal.
        </span>
      )}
      {error && <span className="block text-xs text-red-600">Last try: {error}</span>}
    </p>
  )
}
