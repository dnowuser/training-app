import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { addDays, formatDay, localISODate, startOfWeek } from '../lib/dates'
import { describeSet, loadWeek, weekSummary, type WeekReview } from '../lib/review'
import { supabase } from '../lib/supabase'

/** One week, plan vs what was logged, with a summary to hand to Claude. */
export function ReviewScreen() {
  const today = localISODate()
  const [params, setParams] = useSearchParams()
  const start = params.get('week') ?? startOfWeek(today)
  const [week, setWeek] = useState<WeekReview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    loadWeek(supabase, start, localISODate()).then(
      (w) => !cancelled && setWeek(w),
      (e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)),
    )
    return () => {
      cancelled = true
    }
  }, [start])

  async function copy() {
    if (!week) return
    const text = `Review my training week using the Supabase connector and the rules in CLAUDE.md. Suggest changes for next week, and don't apply them until I say so.\n\n${weekSummary(week)}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError("Couldn't copy; select the summary below instead.")
    }
  }

  const go = (d: string) => setParams(d === startOfWeek(today) ? {} : { week: d })
  const done = week?.days.filter((d) => d.state === 'done' || d.state === 'partial').length ?? 0
  const misses = week?.sets.filter((s) => s.hit_target === false) ?? []
  const work = week?.sets.filter((s) => !s.is_warmup) ?? []
  const hit = work.filter((s) => s.hit_target !== false).length

  return (
    <section>
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => go(addDays(start, -7))} className="px-3 py-2 text-2xl" aria-label="Previous week">
          ‹
        </button>
        <div className="text-center">
          <h1 className="text-xl font-semibold">Week review</h1>
          <p className="text-sm text-neutral-500">
            {formatDay(start)} to {formatDay(addDays(start, 6))}
          </p>
        </div>
        <button type="button" onClick={() => go(addDays(start, 7))} className="px-3 py-2 text-2xl" aria-label="Next week">
          ›
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {!week && !error && <p className="mt-4 text-neutral-500">Loading…</p>}
      {week && (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Stat value={`${done}/${week.days.length}`} label="sessions" />
            <Stat value={`${hit}/${work.length}`} label="work sets on target" />
            <Stat value={String(misses.length)} label="missed targets" />
          </div>

          <ul className="mt-4 divide-y divide-neutral-200 dark:divide-neutral-800">
            {week.days.map((d) => (
              <li key={d.id}>
                <Link to={`/day/${d.date}`} className="flex items-center justify-between py-3">
                  <span>
                    <span className="block font-medium">{d.name}</span>
                    <span className="block text-xs text-neutral-500">{formatDay(d.date)}</span>
                  </span>
                  <span className="text-right text-sm">
                    <span className="block capitalize">{d.state.replace('_', ' ')}</span>
                    <span className="block text-xs text-neutral-500">
                      {d.logged}/{d.planned} sets
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {misses.length > 0 && (
            <>
              <h2 className="mt-6 text-xs font-semibold tracking-wide text-neutral-500 uppercase">Missed targets</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {misses.map((s, i) => (
                  <li key={i}>
                    {formatDay(s.date)} · {s.exercise} set {s.set_number}: {describeSet(s)}
                    {s.set_note && <span className="block text-xs text-neutral-500 italic">{s.set_note}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}

          <button type="button" onClick={() => void copy()} className="mt-6 h-12 w-full rounded-xl bg-violet-600 font-semibold text-white">
            {copied ? 'Copied' : 'Copy summary for Claude'}
          </button>
          <p className="mt-2 text-xs text-neutral-500">
            Paste it into a chat that has the Supabase connector. Claude reads the full logs from there and proposes next week's changes.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-neutral-100 p-3 text-xs whitespace-pre-wrap dark:bg-neutral-900">{weekSummary(week)}</pre>
        </>
      )}
    </section>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl bg-neutral-100 p-3 dark:bg-neutral-900">
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-neutral-500">{label}</div>
    </div>
  )
}
