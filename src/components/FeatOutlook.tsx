import { useEffect, useState } from 'react'
import { formatDay } from '../lib/dates'
import { loadOutlooks, type Outlook } from '../lib/outlook'
import { formatSeconds } from '../lib/progress'
import { supabase } from '../lib/supabase'
import { LineChart } from './LineChart'

const CYCLE_START = '2026-10-12'

const formatValue = (o: Outlook) => (v: number) =>
  o.unit === 'lb' ? `${Math.round(v)}` : o.unit === 'time' ? formatSeconds(v) : o.unit === 'in' ? `${Math.round(v)} in` : `${Math.round(v)}`
const goalLabel = (o: Outlook) =>
  o.unit === 'lb' ? `${o.goal} lb` : o.unit === 'time' ? formatSeconds(o.goal + 1) : o.unit === 'in' ? `${o.goal} in` : `Step ${o.goal}`
const month = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })

/** Every feat's progress so far and a projected path to the goal, with the date it lands. */
export function FeatOutlook() {
  const [list, setList] = useState<Outlook[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pick, setPick] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    loadOutlooks(supabase, CYCLE_START).then(setList, (e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!list) return <p className="text-sm text-neutral-500">Loading…</p>
  const sorted = [...list].sort((a, b) => Number(a.done) - Number(b.done) || (a.eta ?? '9999').localeCompare(b.eta ?? '9999'))
  const o = sorted.find((x) => x.slug === pick) ?? sorted[0]
  const current = o.history.at(-1)?.y
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="-mx-1 flex gap-1 overflow-x-auto pb-1">
        {sorted.map((x) => (
          <button
            key={x.slug}
            type="button"
            onClick={() => setPick(x.slug)}
            aria-pressed={x.slug === o.slug}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${
              x.slug === o.slug ? 'border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900' : 'border-neutral-300 dark:border-neutral-700'
            }`}
          >
            {x.name}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-2">
        <h3 className="font-semibold">{o.name}</h3>
        <p className="text-right text-sm">
          {o.done ? (
            <span className="font-semibold text-emerald-600">Done</span>
          ) : o.eta ? (
            <>
              On pace for <span className="font-semibold">{month(o.eta)}</span>
            </>
          ) : (
            <span className="text-neutral-500">Past 4 years at this pace</span>
          )}
        </p>
      </div>
      <p className="text-xs text-neutral-500">
        {o.basis}
        {current !== undefined && ` · now ${formatValue(o)(current)}${o.unit === 'steps' ? ` of ${o.goal}` : ''}`} · goal {goalLabel(o)}
      </p>
      <LineChart
        label={`${o.name}: progress so far and projected path to the goal`}
        series={[
          { name: 'So far', color: 'var(--series-1)', points: o.history },
          { name: 'Projected', color: 'var(--series-2)', points: o.projection, dashed: true },
        ]}
        target={{ value: o.goal, label: goalLabel(o) }}
        formatY={formatValue(o)}
      />
      <p className="mt-1 text-xs text-neutral-500">
        Dashed: an ambitious but realistic pace. Gains shrink each month; ladders use the fast end of each feat's usual range, or your
        own pace once you've hit two steps and it's faster.
      </p>
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="text-xs text-neutral-500">
            <th className="text-left font-normal">Feat</th>
            <th className="text-right font-normal">Now</th>
            <th className="text-right font-normal">On pace for</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((x) => {
            const now = x.history.at(-1)?.y
            return (
              <tr key={x.slug} className={x.slug === o.slug ? 'font-semibold' : ''} onClick={() => setPick(x.slug)}>
                <td className="py-1 pr-2">
                  <button type="button" className="text-left" onClick={() => setPick(x.slug)}>
                    {x.name}
                  </button>
                </td>
                <td className="text-right text-neutral-500 tabular-nums">
                  {now === undefined ? '—' : x.unit === 'steps' ? `${now}/${x.goal}` : formatValue(x)(now)}
                </td>
                <td className="text-right tabular-nums">{x.done ? 'Done' : x.eta ? month(x.eta) : '4+ yrs'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {o.eta && !o.done && <p className="mt-2 text-xs text-neutral-500">Projected goal date: {formatDay(o.eta)}.</p>}
    </div>
  )
}
