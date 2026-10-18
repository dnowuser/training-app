import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { LineChart } from '../components/LineChart'
import { check, logChange } from '../lib/api'
import { addDays, formatDay, localISODate, startOfWeek } from '../lib/dates'
import {
  e1rmSeries,
  formatSeconds,
  holdSeries,
  loadProgress,
  metricSeries,
  parseTime,
  weeklySets,
  type ProgressData,
} from '../lib/progress'
import { MuscleDiagram } from '../components/MuscleDiagram'
import { loadWeek, muscleWeek, weekLevels, type MuscleWeek } from '../lib/muscles'
import { supabase } from '../lib/supabase'
import type { Area } from '../lib/types'

const LIFTS = [
  { slug: 'back-squat', name: 'Squat', goal: 315 },
  { slug: 'bench-press', name: 'Bench', goal: 315 },
  { slug: 'deadlift', name: 'Deadlift', goal: 405 },
]

const HOLDS = ['front-lever', 'planche-lean', 'tuck-l-sit', 'handstand-practice', 'bridge-hold', 'front-split-hold']

const AREAS: { area: Area; label: string }[] = [
  { area: 'lifting', label: 'Lifting' },
  { area: 'accessory', label: 'Accessories' },
  { area: 'calisthenics', label: 'Calisthenics' },
  { area: 'jumping', label: 'Jumping' },
  { area: 'running', label: 'Running' },
  { area: 'mobility', label: 'Mobility' },
]

const WEEKS = 12

export function ProgressScreen() {
  const [data, setData] = useState<ProgressData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const today = localISODate()

  useEffect(() => {
    if (!supabase) return
    const since = addDays(startOfWeek(localISODate()), -7 * (WEEKS - 1))
    loadProgress(supabase, since).then(setData, (e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [version])

  if (!supabase) return <h1 className="text-2xl font-semibold">Progress</h1>
  if (!data) return <p className="text-neutral-500">{error ?? 'Loading…'}</p>

  const idBySlug = new Map(data.exercises.map((e) => [e.slug, e.id]))
  const nameBySlug = new Map(data.exercises.map((e) => [e.slug, e.name]))
  const areaBySlug = new Map(data.exercises.map((e) => [e.slug, e.area]))
  const lb = (v: number) => `${Math.round(v)}`

  return (
    <section>
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">Progress</h1>
        <Link to="/week" className="text-sm text-neutral-500 underline">
          Week and month plan
        </Link>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <RecordMetric exercises={data.exercises} onSaved={() => setVersion((v) => v + 1)} />

      <Heading>Lifts</Heading>
      {LIFTS.map((lift) => {
        const tm = metricSeries(data.metrics, 'training_max', idBySlug.get(lift.slug))
        const est = e1rmSeries(data.log, lift.slug)
        return (
          <Card
            key={lift.slug}
            title={`${lift.name} → ${lift.goal}`}
            stat={tm.length ? `Training max ${tm.at(-1)!.y} lb${est.length ? ` · best est. max ${est.at(-1)!.y} lb` : ''}` : undefined}
          >
            {tm.length || est.length ? (
              <LineChart
                label={`${lift.name} training max and estimated max over time`}
                series={[
                  { name: 'Training max', color: 'var(--series-1)', points: tm },
                  { name: 'Est. max from sets', color: 'var(--series-2)', points: est },
                ]}
                target={{ value: lift.goal, label: `${lift.goal} goal` }}
                formatY={lb}
              />
            ) : (
              <Empty>Record a training max to start this chart.</Empty>
            )}
          </Card>
        )
      })}

      <Heading>Jumping and running</Heading>
      <MetricCard
        title="Touch height"
        points={metricSeries(data.metrics, 'touch_height')}
        target={{ value: 120, label: 'Rim, 10 ft' }}
        format={(v) => `${Math.round(v)} in`}
        empty="Record your max touch height (inches) to track the dunk."
      />
      <MetricCard
        title="Mile"
        points={metricSeries(data.metrics, 'mile_time')}
        target={{ value: 360, label: '6:00 goal' }}
        format={formatSeconds}
        empty="Record a mile time trial to track the sub-6:00."
      />
      <MetricCard
        title="5K"
        points={metricSeries(data.metrics, '5k_time')}
        target={{ value: 1440, label: '24:00 goal' }}
        format={formatSeconds}
        empty="Record a 5K time trial to track the sub-24:00."
      />

      <Heading>Holds</Heading>
      {HOLDS.map((slug) => ({ slug, points: holdSeries(data.log, slug) }))
        .filter((h) => h.points.length)
        .map((h) => (
          <Card key={h.slug} title={nameBySlug.get(h.slug) ?? h.slug} stat={`Best ${Math.max(...h.points.map((p) => p.y))} s`}>
            <LineChart label={`${h.slug} longest hold per session`} series={[{ name: 'Longest hold', color: 'var(--series-1)', points: h.points }]} formatY={(v) => `${Math.round(v)} s`} />
          </Card>
        ))}
      {HOLDS.every((slug) => !holdSeries(data.log, slug).length) && <Empty>Hold times show up here once you log front lever, planche or handstand holds.</Empty>}

      <Heading>Bodyweight</Heading>
      <MetricCard title="Bodyweight" points={metricSeries(data.metrics, 'bodyweight')} format={(v) => `${v} lb`} empty="Record your bodyweight to see the trend." />

      <Heading>Muscles this week</Heading>
      <MuscleMap />

      <Heading>Work sets per week</Heading>
      <WeeklySets weeks={weeklySets(data.log, areaBySlug, today, 8)} />

      <Heading>Consistency</Heading>
      <Consistency sessions={data.sessions} today={today} />

      <Heading>Recent milestones</Heading>
      {data.milestones.length ? (
        <ul className="space-y-2">
          {data.milestones.map((m) => (
            <li key={m.id} className="text-sm">
              <span className="font-medium">{m.title}</span>
              <span className="block text-xs text-neutral-500">{formatDay(m.achieved_on)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>
          Mark ladder steps on the <Link to="/feats" className="underline">Feats</Link> tab and they show up here.
        </Empty>
      )}
    </section>
  )
}

function Heading({ children }: { children: ReactNode }) {
  return <h2 className="mt-8 mb-2 text-xs font-semibold tracking-wide text-neutral-500 uppercase">{children}</h2>
}

function Card({ title, stat, children }: { title: string; stat?: string; children: ReactNode }) {
  return (
    <div className="mb-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h3 className="font-semibold">{title}</h3>
      {stat && <p className="text-sm text-neutral-600 dark:text-neutral-300">{stat}</p>}
      <div className="mt-2">{children}</div>
    </div>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-neutral-500">{children}</p>
}

function MetricCard({
  title,
  points,
  target,
  format,
  empty,
}: {
  title: string
  points: { x: string; y: number }[]
  target?: { value: number; label: string }
  format: (v: number) => string
  empty: string
}) {
  return (
    <Card title={title} stat={points.length ? `Latest ${format(points.at(-1)!.y)} on ${formatDay(points.at(-1)!.x)}` : undefined}>
      {points.length ? (
        <LineChart label={`${title} over time`} series={[{ name: title, color: 'var(--series-1)', points }]} target={target} formatY={format} />
      ) : (
        <Empty>{empty}</Empty>
      )}
    </Card>
  )
}

function WeeklySets({ weeks }: { weeks: ReturnType<typeof weeklySets> }) {
  const max = Math.max(1, ...weeks.flatMap((w) => [...w.byArea.values()]))
  const shown = AREAS.filter(({ area }) => weeks.some((w) => w.byArea.get(area)))
  if (!shown.length) return <Empty>Logged work sets per area show up here, week by week.</Empty>
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="mb-2 text-xs text-neutral-500">Last 8 weeks, oldest on the left. Number is this week.</p>
      <table className="w-full text-sm">
        <tbody>
          {shown.map(({ area, label }) => (
            <tr key={area}>
              <td className="w-28 py-1.5 pr-2">{label}</td>
              <td className="py-1.5">
                <div className="flex h-6 items-end gap-[2px]">
                  {weeks.map((w) => {
                    const n = w.byArea.get(area) ?? 0
                    return (
                      <span
                        key={w.week}
                        title={`Week of ${formatDay(w.week)}: ${n} sets`}
                        className="flex-1 rounded-t-[4px]"
                        style={{ height: `${Math.max(n ? 8 : 2, (n / max) * 100)}%`, background: n ? 'var(--series-1)' : 'var(--chart-grid)' }}
                      />
                    )
                  })}
                </div>
              </td>
              <td className="w-10 py-1.5 text-right font-semibold tabular-nums">{weeks.at(-1)!.byArea.get(area) ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const STATUS_CELL: Record<string, { bg: string; label: string }> = {
  done: { bg: 'bg-emerald-600', label: 'Done' },
  partial: { bg: 'bg-amber-500', label: 'Partial' },
  in_progress: { bg: 'bg-amber-500', label: 'Partial' },
  skipped: { bg: 'bg-neutral-400', label: 'Skipped' },
  missed: { bg: 'bg-red-500/60', label: 'Missed' },
  planned: { bg: 'bg-neutral-200 dark:bg-neutral-800', label: 'Planned' },
}

function Consistency({ sessions, today }: { sessions: { date: string; status: string }[]; today: string }) {
  const start = addDays(startOfWeek(today), -7 * (WEEKS - 1))
  const byDate = new Map(sessions.map((s) => [s.date, s.status]))
  const stateOf = (date: string) => {
    const status = byDate.get(date)
    if (!status) return null
    if (status === 'planned' && date < today) return 'missed'
    return status
  }
  const past = sessions.filter((s) => s.date <= today)
  const done = past.filter((s) => s.status === 'done' || s.status === 'partial').length
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="text-sm">
        {done} of {past.length} sessions done in the last {WEEKS} weeks
      </p>
      <div className="mt-2 grid grid-flow-col grid-rows-7 gap-[3px]" style={{ gridTemplateColumns: `repeat(${WEEKS}, minmax(0, 1fr))` }}>
        {Array.from({ length: WEEKS * 7 }, (_, i) => {
          const date = addDays(start, i)
          const state = date > today ? (byDate.has(date) ? 'planned' : null) : stateOf(date)
          const cell = state ? STATUS_CELL[state] : null
          return (
            <Link
              key={date}
              to={`/day/${date}`}
              title={`${formatDay(date)}: ${cell?.label ?? 'No session'}`}
              className={`aspect-square rounded-[3px] ${cell ? cell.bg : 'bg-neutral-100 dark:bg-neutral-900'} ${date === today ? 'ring-2 ring-neutral-900 dark:ring-white' : ''}`}
            />
          )
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-neutral-500">
        {['done', 'partial', 'missed', 'skipped', 'planned'].map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className={`h-3 w-3 rounded-[3px] ${STATUS_CELL[s].bg}`} />
            {STATUS_CELL[s].label}
          </span>
        ))}
      </div>
    </div>
  )
}

const KINDS = [
  { kind: 'bodyweight', label: 'Bodyweight (lb)', unit: 'lb' },
  { kind: 'touch_height', label: 'Touch height (in)', unit: 'in' },
  { kind: 'mile_time', label: 'Mile time (m:ss)', unit: 's' },
  { kind: '5k_time', label: '5K time (m:ss)', unit: 's' },
  { kind: 'training_max', label: 'Training max (lb)', unit: 'lb' },
] as const

function RecordMetric({ exercises, onSaved }: { exercises: ProgressData['exercises']; onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<(typeof KINDS)[number]['kind']>('bodyweight')
  const [lift, setLift] = useState('back-squat')
  const [value, setValue] = useState('')
  const [date, setDate] = useState(localISODate)
  const [error, setError] = useState<string | null>(null)
  const field = 'h-11 w-full rounded-lg border border-neutral-300 bg-white px-3 dark:border-neutral-700 dark:bg-neutral-900'
  const spec = KINDS.find((k) => k.kind === kind)!

  async function save() {
    const n = spec.unit === 's' ? parseTime(value) : Number(value)
    if (n === null || !Number.isFinite(n) || n <= 0) return setError('Enter a number (times as m:ss).')
    const exercise = kind === 'training_max' ? exercises.find((e) => e.slug === lift) : undefined
    try {
      check(
        await supabase!
          .from('metrics')
          .insert({ kind, value: n, unit: spec.unit, measured_on: date, exercise_id: exercise?.id ?? null }),
      )
      if (exercise) {
        await logChange(supabase!, { summary: `${exercise.name} training max set to ${n} lb`, affects_from: date })
      }
      setValue('')
      setOpen(false)
      setError(null)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-3 h-12 w-full rounded-xl bg-neutral-900 font-semibold text-white dark:bg-white dark:text-neutral-900">
        Record a measurement
      </button>
    )

  return (
    <div className="mt-3 space-y-2 rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
      <select className={field} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
        {KINDS.map((k) => (
          <option key={k.kind} value={k.kind}>
            {k.label}
          </option>
        ))}
      </select>
      {kind === 'training_max' && (
        <select className={field} value={lift} onChange={(e) => setLift(e.target.value)}>
          {LIFTS.map((l) => (
            <option key={l.slug} value={l.slug}>
              {l.name}
            </option>
          ))}
        </select>
      )}
      <input className={field} inputMode={spec.unit === 's' ? 'text' : 'decimal'} placeholder={spec.label} value={value} onChange={(e) => setValue(e.target.value)} />
      <input className={field} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => setOpen(false)} className="h-12 flex-1 rounded-xl bg-neutral-100 dark:bg-neutral-800">
          Cancel
        </button>
        <button type="button" onClick={() => void save()} className="h-12 flex-1 rounded-xl bg-emerald-600 font-semibold text-white">
          Save
        </button>
      </div>
    </div>
  )
}

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/** Planned work sets per muscle on each day of a week, so you can see how often each is trained. */
function MuscleMap() {
  const [monday, setMonday] = useState(() => startOfWeek(localISODate()))
  const [rows, setRows] = useState<MuscleWeek[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [by, setBy] = useState<'logged' | 'planned'>('logged')

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    loadWeek(supabase, monday).then(
      (w) => !cancelled && setRows(muscleWeek(w)),
      (e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)),
    )
    return () => {
      cancelled = true
    }
  }, [monday])

  const max = Math.max(1, ...(rows ?? []).flatMap((r) => r.byDay))
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setMonday(addDays(monday, -7))} className="px-2 text-xl" aria-label="Previous week">
          ‹
        </button>
        <p className="text-sm">Week of {formatDay(monday)}</p>
        <button type="button" onClick={() => setMonday(addDays(monday, 7))} className="px-2 text-xl" aria-label="Next week">
          ›
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {rows && rows.length > 0 && (
        <>
          <div className="mt-2 flex gap-1 rounded-lg bg-neutral-100 p-1 text-sm dark:bg-neutral-800">
            {(['logged', 'planned'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setBy(k)}
                className={`h-9 flex-1 rounded-md ${by === k ? 'bg-white font-semibold dark:bg-neutral-950' : ''}`}
              >
                {k === 'logged' ? 'Sets done' : 'Sets planned'}
              </button>
            ))}
          </div>
          <MuscleDiagram
            level={weekLevels(rows, by)}
            label={`Body map of ${by === 'logged' ? 'sets done' : 'sets planned'} this week`}
            className="mx-auto mt-2 w-full max-w-xs"
          >
            <figcaption className="text-center text-xs text-neutral-500">
              Darker = more sets {by === 'logged' ? 'done' : 'planned'}. Tap a muscle for its name.
            </figcaption>
          </MuscleDiagram>
        </>
      )}
      <p className="mt-2 text-xs text-neutral-500">Work sets per muscle. Warm-ups and stretching not counted.</p>
      {rows && rows.length === 0 && <Empty>No sessions planned this week.</Empty>}
      {rows && rows.length > 0 && (
        <table className="mt-2 w-full table-fixed text-xs">
          <thead>
            <tr className="text-neutral-500">
              <th className="w-24 text-left font-normal">Muscle</th>
              {DAY_LETTERS.map((d, i) => (
                <th key={i} className="font-normal">
                  {d}
                </th>
              ))}
              <th className="w-14 text-right font-normal">Done / plan</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.muscle}>
                <td className="truncate py-0.5 pr-1 capitalize">{r.muscle}</td>
                {r.byDay.map((n, i) => (
                  <td key={i} className="p-[1px]">
                    <span
                      title={`${r.muscle}, ${DAY_LETTERS[i]}: ${n} sets`}
                      className="flex h-6 items-center justify-center rounded-[4px] tabular-nums"
                      style={(() => {
                        // One hue, light to dark with the number of sets; the number stays readable on top.
                        const pct = n ? Math.round(25 + 75 * (n / max)) : 0
                        return {
                          background: n ? `color-mix(in srgb, var(--series-1) ${pct}%, transparent)` : 'var(--chart-grid)',
                          color: pct > 55 ? 'white' : undefined,
                        }
                      })()}
                    >
                      {n || ''}
                    </span>
                  </td>
                ))}
                <td className="text-right tabular-nums">
                  <span className={r.logged >= r.planned ? 'font-semibold text-emerald-700 dark:text-emerald-400' : ''}>{r.logged}</span>
                  <span className="text-neutral-500"> / {r.planned}</span>
                  <span className="block text-[10px] text-neutral-500">{r.days}×/wk</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
