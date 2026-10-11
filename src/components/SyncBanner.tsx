import { useEffect, useState } from 'react'
import { insertSet } from '../lib/api'
import { flushQueue, QUEUE_EVENT, readQueue } from '../lib/offline'
import { supabase } from '../lib/supabase'

/** Sends sets logged without signal as soon as there's a connection, and says how many are waiting. */
export function SyncBanner() {
  const [waiting, setWaiting] = useState(() => readQueue().length)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    const db = supabase
    let running = false
    const flush = async () => {
      if (running || !readQueue().length || !navigator.onLine) return
      running = true
      const result = await flushQueue((set) => insertSet(db, set))
      running = false
      setError(result.remaining && result.error ? result.error : null)
    }
    const onChange = () => setWaiting(readQueue().length)
    window.addEventListener(QUEUE_EVENT, onChange)
    window.addEventListener('online', flush)
    void flush()
    const id = setInterval(() => void flush(), 30_000)
    return () => {
      window.removeEventListener(QUEUE_EVENT, onChange)
      window.removeEventListener('online', flush)
      clearInterval(id)
    }
  }, [])

  if (!waiting) return null
  return (
    <p className="mx-4 mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-sm">
      {waiting} {waiting === 1 ? 'set' : 'sets'} saved on this phone, waiting for signal.
      {error && <span className="block text-xs text-red-600">Last try: {error}</span>}
    </p>
  )
}
