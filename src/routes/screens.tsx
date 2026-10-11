import { Link, useParams } from 'react-router'
import { Placeholder } from '../components/Placeholder'
import { formatDay, localISODate } from '../lib/dates'
import { supabase } from '../lib/supabase'

export function CalendarScreen() {
  return (
    <Placeholder
      title="Calendar"
      phase={1}
      items={[
        'Every past and future day',
        'Past days show what you hit against the plan; future days show what is scheduled',
        'Tap a day to open its detail',
      ]}
    >
      <p className="mt-2 text-sm">
        <Link className="underline" to={`/day/${localISODate()}`}>
          Open today's detail
        </Link>
      </p>
    </Placeholder>
  )
}

export function DayScreen() {
  const { date = localISODate() } = useParams()
  return (
    <Placeholder
      title={formatDay(date)}
      phase={1}
      items={['Plan vs actual for each exercise', 'Notes, photos and clips from the day', 'Edit or move the session']}
    />
  )
}

export function FeatsScreen() {
  return (
    <Placeholder
      title="Feats"
      phase={2}
      items={[
        'All 17 feats with stage, current ladder step, next step and date achieved',
        'Mark a step as hit and attach a photo or clip',
      ]}
    />
  )
}

export function ProgressScreen() {
  return (
    <Placeholder
      title="Progress"
      phase={2}
      items={[
        'Training max per lift with 315 and 405 target lines',
        'Touch height against the rim, mile and 5K times against targets',
        'Hold times per ladder step, weekly sets per muscle group',
        'Sessions done vs planned as a calendar heatmap',
      ]}
    />
  )
}

export function MoreScreen() {
  const links = [
    { to: '/media', label: 'Media', hint: 'Photo and video timeline' },
    { to: '/search', label: 'Search', hint: 'Logs, notes, feats and exercises' },
    { to: '/plan', label: 'Plan', hint: 'Weekly template and change log' },
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

export function MediaScreen() {
  return (
    <Placeholder
      title="Media"
      phase={2}
      items={['Photo and video timeline', 'Filter by feat or exercise', 'Side-by-side comparison at the same angle']}
    />
  )
}

export function SearchScreen() {
  return (
    <Placeholder
      title="Search"
      phase={3}
      items={['Any log, note, feat or exercise by text, date or tag']}
    />
  )
}

export function PlanScreen() {
  return (
    <Placeholder
      title="Plan"
      phase={3}
      items={[
        'Weekly template: exercises and targets per day',
        'Changes apply to future days only',
        'Change log of every edit by you or Claude',
      ]}
    />
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
