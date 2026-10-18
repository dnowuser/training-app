import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { MuscleDiagram } from '../components/MuscleDiagram'
import { formatDay } from '../lib/dates'
import { loadExercise, loadLibrary, videoSearchUrl, type ExerciseDetail, type LibraryExercise } from '../lib/library'
import { exerciseLevels } from '../lib/muscles'
import { WEEKDAYS } from '../lib/plan'
import { describePrescription } from '../lib/prescription'
import { describeLastTime } from '../lib/progression'
import { supabase } from '../lib/supabase'
import type { Area, Measure } from '../lib/types'

const AREA_LABELS: Record<Area, string> = {
  lifting: 'Lifting',
  calisthenics: 'Calisthenics',
  jumping: 'Jumping',
  running: 'Running',
  accessory: 'Accessories',
  mobility: 'Mobility',
  movement: 'Movement',
}

const MEASURE_LABELS: Record<Measure, string> = {
  load_reps: 'weight and reps',
  reps: 'reps',
  hold: 'hold time',
  distance: 'distance and time',
  load_distance: 'weight and distance',
  contacts: 'jump contacts',
  duration: 'done',
}

// Old combined blocks, replaced by the individual exercises; hidden from the library.
const RETIRED = new Set(['mobility-a', 'mobility-b', 'long-holds', 'yin-long-holds', 'foot-work', 'reactive-jumps'])

export function Chips({ items, tone = 'neutral' }: { items: string[]; tone?: 'neutral' | 'violet' }) {
  const color =
    tone === 'violet'
      ? 'bg-violet-500/10 text-violet-700 dark:text-violet-300'
      : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
  return (
    <span className="flex flex-wrap gap-1">
      {items.map((m) => (
        <span key={m} className={`rounded-full px-2 py-0.5 text-xs ${color}`}>
          {m}
        </span>
      ))}
    </span>
  )
}

/** Every exercise: what it works, which feats it builds, and how to do it. */
export function ExercisesScreen() {
  const [list, setList] = useState<LibraryExercise[] | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    loadLibrary(supabase).then(setList, (e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  const q = query.trim().toLowerCase()
  const shown = (list ?? []).filter(
    (e) =>
      !RETIRED.has(e.slug) &&
      (!q ||
        e.name.toLowerCase().includes(q) ||
        e.muscles.some((m) => m.includes(q)) ||
        e.feats.some((f) => f.name.toLowerCase().includes(q))),
  )

  return (
    <section>
      <h1 className="text-2xl font-semibold">Exercises</h1>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name, muscle or feat"
        className="mt-3 h-12 w-full rounded-xl border border-neutral-300 bg-white px-4 dark:border-neutral-700 dark:bg-neutral-900"
      />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {!list && !error && <p className="mt-4 text-neutral-500">Loading…</p>}
      {(Object.keys(AREA_LABELS) as Area[]).map((area) => {
        const group = shown.filter((e) => e.area === area)
        if (!group.length) return null
        return (
          <div key={area} className="mt-6">
            <h2 className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">{AREA_LABELS[area]}</h2>
            <ul className="mt-2 divide-y divide-neutral-200 dark:divide-neutral-800">
              {group.map((e) => (
                <li key={e.id}>
                  <Link to={`/exercises/${e.slug}`} className="block py-3">
                    <span className="block font-medium">{e.name}</span>
                    <span className="mt-1 block">
                      <Chips items={e.muscles} />
                    </span>
                    {e.feats.length > 0 && (
                      <span className="mt-1 block">
                        <Chips items={e.feats.map((f) => f.name)} tone="violet" />
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </section>
  )
}

export function ExerciseScreen() {
  const { slug = '' } = useParams()
  const [detail, setDetail] = useState<ExerciseDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    loadExercise(supabase, slug).then(setDetail, (e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [slug])

  if (!detail) return <p className="text-neutral-500">{error ?? 'Loading…'}</p>
  const { exercise: e, plan, history } = detail

  return (
    <section>
      <Link to="/exercises" className="text-sm text-neutral-500">
        ‹ Exercises
      </Link>
      <h1 className="mt-1 text-2xl font-semibold">{e.name}</h1>
      <p className="text-sm text-neutral-500">
        {AREA_LABELS[e.area]} · you log {MEASURE_LABELS[e.measure]}
      </p>

      <h2 className="mt-5 text-xs font-semibold tracking-wide text-neutral-500 uppercase">Works</h2>
      <MuscleDiagram level={exerciseLevels(e.muscles)} label={`Muscles ${e.name} works`} className="mx-auto mt-2 w-full max-w-xs" />
      <div className="mt-1">
        <Chips items={e.muscles} />
      </div>
      <p className="mt-1 text-xs text-neutral-500">Darker = main movers.</p>

      {e.feats.length > 0 && (
        <>
          <h2 className="mt-5 text-xs font-semibold tracking-wide text-neutral-500 uppercase">Builds toward</h2>
          <ul className="mt-1 flex flex-wrap gap-2">
            {e.feats.map((f) => (
              <li key={f.id}>
                <Link to={`/feats/${f.slug}`} className="rounded-full bg-violet-500/10 px-3 py-1 text-sm text-violet-700 dark:text-violet-300">
                  {f.name}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className="mt-5 text-xs font-semibold tracking-wide text-neutral-500 uppercase">How to do it</h2>
      <p className="mt-1">{e.cues ?? 'No instructions yet.'}</p>
      <a href={videoSearchUrl(e.name)} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm underline">
        Watch how-to videos ↗
      </a>

      <h2 className="mt-5 text-xs font-semibold tracking-wide text-neutral-500 uppercase">In your plan</h2>
      {plan.length ? (
        <ul className="mt-1 space-y-1 text-sm">
          {plan.map((p, i) => (
            <li key={i}>
              <span className="font-medium">{WEEKDAYS[p.weekday - 1]}</span> · {describePrescription(p.prescription)}
              {p.notes && <span className="text-neutral-500"> · {p.notes}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-neutral-500">Not in the weekly plan.</p>
      )}

      <h2 className="mt-5 text-xs font-semibold tracking-wide text-neutral-500 uppercase">Your history</h2>
      {history.length ? (
        <ul className="mt-1 space-y-1 text-sm">
          {history.slice(0, 12).map((h) => (
            <li key={h.date}>
              <Link to={`/day/${h.date}`} className="underline">
                {formatDay(h.date)}
              </Link>{' '}
              · {describeLastTime(h)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-neutral-500">Nothing logged yet.</p>
      )}
    </section>
  )
}
