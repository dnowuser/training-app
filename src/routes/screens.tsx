import { useEffect, useState } from 'react'
import { AnatomyMap } from '../components/AnatomyMap'
import { NOT_DRAWN } from '../lib/anatomy'
import { Link } from 'react-router'
import { addDays, localISODate, startOfWeek } from '../lib/dates'
import { balanceColor, loadPlan, muscleBalance, type MuscleRef, type PlanItem } from '../lib/overview'
import { download, exportAll, exportLogCsv } from '../lib/exportData'
import { supabase } from '../lib/supabase'

/** Sign out and forget the data saved on this phone for offline use. */
async function signOut() {
  navigator.serviceWorker?.controller?.postMessage('clear-data')
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith('day:')) localStorage.removeItem(key)
  } catch {
    // Storage blocked: nothing saved to clear.
  }
  await supabase?.auth.signOut()
}

const LINKS: { to: string; label: string; icon: IconName }[] = [
  { to: '/notes', label: 'Notes', icon: 'notes' },
  { to: '/review', label: 'Review', icon: 'review' },
  { to: '/exercises', label: 'Exercises', icon: 'exercises' },
  { to: '/plan', label: 'Plan', icon: 'plan' },
  { to: '/media', label: 'Media', icon: 'media' },
  { to: '/search', label: 'Search', icon: 'search' },
]

export function MoreScreen() {
  return (
    <section>
      <h1 className="text-2xl font-semibold">More</h1>
      {supabase && <WeekMuscles />}
      <ul className="mt-4 grid grid-cols-3 gap-2">
        {LINKS.map((l) => (
          <li key={l.to}>
            <Link
              to={l.to}
              className="flex flex-col items-center justify-center gap-1.5 rounded-2xl py-4 bg-neutral-100 text-sm font-medium active:bg-neutral-200 dark:bg-neutral-900 dark:active:bg-neutral-800"
            >
              <Icon name={l.icon} />
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
      {supabase && <Backup />}
      {supabase && (
        <button type="button" onClick={() => void signOut()} className="mt-4 w-full py-3 text-sm text-neutral-500 underline">
          Sign out
        </button>
      )}
    </section>
  )
}

/** This week's training balance on the body map; tap through to the week plan. */
function WeekMuscles() {
  const [data, setData] = useState<{ items: PlanItem[]; muscles: MuscleRef[] } | null>(null)
  useEffect(() => {
    const monday = startOfWeek(localISODate())
    loadPlan(supabase!, monday, addDays(monday, 6)).then(setData, () => setData({ items: [], muscles: [] }))
  }, [])
  const rows = data ? muscleBalance(data.items, data.muscles, 1) : []
  const fills = Object.fromEntries(rows.map((r) => [r.muscle, { fill: balanceColor(r.ratio), title: `${r.muscle}: ${r.perWeek} of ${r.target} sets` }]))
  const low = rows.filter((r) => r.ratio < 0.75 && !NOT_DRAWN.includes(r.muscle)).slice(0, 3)
  return (
    <Link to="/week" className="mt-4 block rounded-2xl bg-neutral-100 p-4 active:bg-neutral-200 dark:bg-neutral-900 dark:active:bg-neutral-800">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">This week's muscles</h2>
        <span className="text-sm text-neutral-500">Week plan ›</span>
      </div>
      {data ? (
        <AnatomyMap fills={fills} label="This week's training balance" className="mx-auto mt-2 w-full max-w-xs" />
      ) : (
        <div className="mx-auto mt-2 aspect-square w-full max-w-xs animate-pulse rounded-xl bg-neutral-200 dark:bg-neutral-800" />
      )}
      <div className="mt-2 flex items-center gap-2 text-xs text-neutral-500">
        <span>Under</span>
        <span
          className="h-2 flex-1 rounded-full"
          style={{ background: `linear-gradient(to right, ${[0, 0.5, 1, 1.5, 2].map(balanceColor).join(', ')})` }}
        />
        <span>Over</span>
      </div>
      {low.length > 0 && (
        <p className="mt-2 text-sm">
          <span className="text-neutral-500">Low: </span>
          <span className="capitalize">{low.map((r) => r.muscle).join(', ')}</span>
        </p>
      )}
    </Link>
  )
}

type IconName = 'notes' | 'review' | 'exercises' | 'plan' | 'media' | 'search'

const ICON_PATHS: Record<IconName, string> = {
  notes: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h5',
  review: 'M4 6l2 2 3-3M4 13l2 2 3-3M4 20l2 2M12 7h8M12 14h8M12 21h5',
  exercises: 'M3 10v4M6 7v10M18 7v10M21 10v4M6 12h12',
  plan: 'M8 4h8v3H8zM6 5H5v16h14V5h-1M8 12h8M8 16h5',
  media: 'M4 8h4l2-3h4l2 3h4v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM16 16l5 5',
}

function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={ICON_PATHS[name]} />
    </svg>
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
    <div className="mt-4 rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="font-semibold">Back up</h2>
      <p className="mt-1 text-sm text-neutral-500">Deleted or changed logs can always be restored.</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void run('json')}
          className="h-11 flex-1 rounded-xl bg-neutral-900 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {busy === 'json' ? 'Preparing…' : 'Everything'}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void run('csv')}
          className="h-11 flex-1 rounded-xl bg-neutral-100 text-sm font-semibold disabled:opacity-50 dark:bg-neutral-800"
        >
          {busy === 'csv' ? 'Preparing…' : 'Sets (CSV)'}
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
