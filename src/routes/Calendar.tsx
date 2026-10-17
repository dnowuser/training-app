import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { loadCalendar, loadExerciseFeats, summarize, type CalendarDay, type DayState } from '../lib/calendar'
import { addMonths, formatDay, formatMonth, localISODate, monthGrid } from '../lib/dates'
import { supabase } from '../lib/supabase'

const DAY_TYPE_BAR: Record<CalendarDay['dayType'], string> = {
  hard: 'bg-red-500',
  easy: 'bg-emerald-500',
  recovery: 'bg-sky-500',
  rest: 'bg-neutral-400',
}

const STATE_STYLE: Record<DayState, { cell: string; label: string }> = {
  done: { cell: 'bg-emerald-600 text-white', label: 'Done' },
  partial: { cell: 'bg-amber-500 text-white', label: 'Partial' },
  in_progress: { cell: 'bg-sky-600 text-white', label: 'In progress' },
  missed: { cell: 'bg-neutral-200 text-neutral-500 line-through dark:bg-neutral-800', label: 'Missed' },
  skipped: { cell: 'bg-neutral-200 text-neutral-500 dark:bg-neutral-800', label: 'Skipped' },
  planned: { cell: 'bg-white dark:bg-neutral-900', label: 'Planned' },
  today: { cell: 'bg-white ring-2 ring-emerald-500 dark:bg-neutral-900', label: 'Today' },
}

export function CalendarScreen() {
  const today = localISODate()
  const [params, setParams] = useSearchParams()
  const month = params.get('month') ?? today.slice(0, 7)
  const grid = monthGrid(month)
  const [days, setDays] = useState<Map<string, CalendarDay[]>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [featFilter, setFeatFilter] = useState('')

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    const range = monthGrid(month)
    Promise.all([loadCalendar(supabase, range[0], range.at(-1)!), loadExerciseFeats(supabase)]).then(
      ([rows, links]) => {
        if (cancelled) return
        const map = new Map<string, CalendarDay[]>()
        for (const r of rows) map.set(r.date, [...(map.get(r.date) ?? []), summarize(r, localISODate(), links)])
        setDays(map)
        setError(null)
      },
      (e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)),
    )
    return () => {
      cancelled = true
    }
  }, [month])

  const go = (m: string) => setParams(m === today.slice(0, 7) ? {} : { month: m })
  const inMonth = [...days.values()]
    .flat()
    .filter((d) => d.date.startsWith(month))
    .sort((a, b) => a.date.localeCompare(b.date))
  const allFeats = [...new Map(inMonth.flatMap((d) => d.feats).map((f) => [f.slug, f])).values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  )
  const trains = (d: CalendarDay | undefined) => !featFilter || Boolean(d?.feats.some((f) => f.slug === featFilter))
  const done = inMonth.filter((d) => d.state === 'done' || d.state === 'partial').length
  const past = inMonth.filter((d) => d.date < today).length

  return (
    <section>
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => go(addMonths(month, -1))} className="px-3 py-2 text-2xl" aria-label="Previous month">
          ‹
        </button>
        <div className="text-center">
          <h1 className="text-xl font-semibold">{formatMonth(month)}</h1>
          {month !== today.slice(0, 7) && (
            <button type="button" onClick={() => go(today.slice(0, 7))} className="text-xs underline">
              Back to today
            </button>
          )}
        </div>
        <button type="button" onClick={() => go(addMonths(month, 1))} className="px-3 py-2 text-2xl" aria-label="Next month">
          ›
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {allFeats.length > 0 && (
        <select
          value={featFilter}
          onChange={(e) => setFeatFilter(e.target.value)}
          aria-label="Show days that train a feat"
          className="mt-2 h-10 w-full rounded-lg border border-neutral-300 bg-white px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        >
          <option value="">All days</option>
          {allFeats.map((f) => (
            <option key={f.slug} value={f.slug}>
              Days that train {f.name}
            </option>
          ))}
        </select>
      )}

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs text-neutral-500">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {grid.map((date) => {
          const list = days.get(date) ?? []
          const first = list[0]
          const style = first ? STATE_STYLE[first.state] : null
          const outside = !date.startsWith(month)
          return (
            <Link
              key={date}
              to={`/day/${date}`}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-lg text-sm ${style ? style.cell : 'text-neutral-400'} ${outside || (featFilter && !list.some(trains)) ? 'opacity-30' : ''} ${!first && date === today ? 'ring-2 ring-emerald-500' : ''}`}
            >
              <span className="font-medium">{Number(date.slice(8))}</span>
              {first && <span className={`mt-0.5 h-1 w-5 rounded-full ${DAY_TYPE_BAR[first.dayType]}`} />}
              {first?.isDeload && <span className="absolute top-0.5 right-1 text-[9px] font-bold">D</span>}
            </Link>
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-500">
        <Legend bar="bg-red-500" label="Hard" />
        <Legend bar="bg-emerald-500" label="Easy" />
        <Legend bar="bg-sky-500" label="Recovery" />
        <span>■ green done · amber partial · D deload</span>
      </div>
      {past > 0 && (
        <p className="mt-2 text-sm">
          {done} of {past} past sessions this month done.
        </p>
      )}

      <ul className="mt-4 divide-y divide-neutral-200 dark:divide-neutral-800">
        {inMonth.filter(trains).map((d) => (
          <li key={d.id}>
            <Link to={`/day/${d.date}`} className={`flex items-center gap-3 py-3 ${d.date === today ? 'font-semibold' : ''}`}>
              <span className={`h-8 w-1 shrink-0 rounded-full ${DAY_TYPE_BAR[d.dayType]}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{d.name}</span>
                <span className="block text-xs text-neutral-500">
                  {formatDay(d.date)}
                  {d.week ? ` · week ${d.week}` : ''}
                  {d.isDeload ? ' · deload' : ''}
                </span>
                {d.feats.length > 0 && (
                  <span className="block truncate text-xs text-violet-700 dark:text-violet-300">
                    {d.feats
                      .slice(0, 3)
                      .map((f) => f.name)
                      .join(', ')}
                    {d.feats.length > 3 ? ` +${d.feats.length - 3}` : ''}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-right text-xs">
                <span className="block">{STATE_STYLE[d.state].label}</span>
                {d.logged > 0 && (
                  <span className="block text-neutral-500">
                    {d.logged}/{d.planned} sets
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Legend({ bar, label }: { bar: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`h-1 w-4 rounded-full ${bar}`} />
      {label}
    </span>
  )
}
