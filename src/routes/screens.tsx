import { Link } from 'react-router'
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
