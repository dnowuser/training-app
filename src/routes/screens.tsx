import { useState } from 'react'
import { Link } from 'react-router'
import { localISODate } from '../lib/dates'
import { download, exportAll, exportLogCsv } from '../lib/exportData'
import { supabase } from '../lib/supabase'

export function MoreScreen() {
  const links = [
    { to: '/review', label: 'Week review', hint: 'Plan vs what you hit, and a summary for Claude' },
    { to: '/plan', label: 'Plan', hint: 'Weekly template, cycle and change log' },
    { to: '/media', label: 'Media', hint: 'Photo and video timeline, side-by-side compare' },
    { to: '/search', label: 'Search', hint: 'Logs, notes, feats, milestones and dates' },
  ]
  return (
    <section>
      <h1 className="text-2xl font-semibold">More</h1>
      <ul className="mt-4 divide-y divide-neutral-200 dark:divide-neutral-800">
        {links.map((l) => (
          <li key={l.to}>
            <Link to={l.to} className="block py-3">
              <span className="font-medium">{l.label}</span>
              <span className="block text-sm text-neutral-500">{l.hint}</span>
            </Link>
          </li>
        ))}
      </ul>
      {supabase && <Backup />}
      {supabase && (
        <button
          type="button"
          onClick={() => void supabase?.auth.signOut()}
          className="mt-6 w-full rounded-xl border border-neutral-300 py-3 text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
        >
          Sign out
        </button>
      )}
    </section>
  )
}

/** Download a full copy of your data, any time. */
function Backup() {
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function run(kind: 'json' | 'csv') {
    if (!supabase) return
    setBusy(kind)
    setMessage(null)
    try {
      const date = localISODate()
      if (kind === 'json') {
        const data = await exportAll(supabase)
        const sets = data.sets.length
        download(`training-backup-${date}.json`, JSON.stringify({ exported_at: new Date().toISOString(), ...data }, null, 1), 'application/json')
        setMessage(`Saved a full backup (${sets} logged sets).`)
      } else {
        download(`training-log-${date}.csv`, await exportLogCsv(supabase), 'text/csv')
        setMessage('Saved your set log as a spreadsheet.')
      }
    } catch (e) {
      setMessage(`Couldn't export: ${e instanceof Error ? e.message : String(e)}`)
    }
    setBusy(null)
  }

  return (
    <div className="mt-6 rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="font-semibold">Your data</h2>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
        Everything is saved in the database as you log it, and anything deleted or changed is kept in a trash so it can be restored.
        Download a copy any time to keep your own.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void run('json')}
          className="h-11 flex-1 rounded-xl bg-neutral-900 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {busy === 'json' ? 'Preparing…' : 'Full backup (JSON)'}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void run('csv')}
          className="h-11 flex-1 rounded-xl bg-neutral-100 text-sm font-semibold disabled:opacity-50 dark:bg-neutral-800"
        >
          {busy === 'csv' ? 'Preparing…' : 'Set log (CSV)'}
        </button>
      </div>
      {message && <p className="mt-2 text-sm">{message}</p>}
    </div>
  )
}

export function NotFoundScreen() {
  return (
    <section>
      <h1 className="text-2xl font-semibold">Not found</h1>
      <Link className="mt-2 inline-block underline" to="/">
        Back to today
      </Link>
    </section>
  )
}
