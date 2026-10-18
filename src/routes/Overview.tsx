import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { MuscleDiagram } from '../components/MuscleDiagram'
import { addDays, localISODate, parseISODate, startOfWeek } from '../lib/dates'
import {
  BLOCK_COLORS,
  BLOCK_LABELS,
  BLOCK_ORDER,
  FEAT_KINDS,
  GROUP_COLORS,
  MUSCLE_VIEWS,
  balanceColor,
  dayParts,
  featKind,
  featTable,
  loadPlan,
  muscleTree,
  regionBalance,
  type MuscleNode,
  type MuscleRef,
  type MuscleView,
  type PlanItem,
} from '../lib/overview'
import { supabase } from '../lib/supabase'

type Period = 'week' | 'month'

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => parseISODate(iso).toLocaleDateString('en-US', opts)
const monthStart = (iso: string) => iso.slice(0, 8) + '01'
function monthEnd(iso: string): string {
  const d = parseISODate(monthStart(iso))
  return localISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}
function shiftMonth(iso: string, n: number): string {
  const d = parseISODate(monthStart(iso))
  return localISODate(new Date(d.getFullYear(), d.getMonth() + n, 1))
}
function rangeOf(period: Period, anchor: string): { start: string; end: string } {
  if (period === 'month') return { start: monthStart(anchor), end: monthEnd(anchor) }
  const start = startOfWeek(anchor)
  return { start, end: addDays(start, 6) }
}
/** Now: on a Sunday the week view jumps to the week about to start. */
function nowAnchor(period: Period): string {
  const today = localISODate()
  return period === 'week' && parseISODate(today).getDay() === 0 ? addDays(today, 1) : today
}

/** The plan for a week or month: time per day, muscles (with what's undertrained) and feats. */
export function OverviewScreen() {
  const [period, setPeriod] = useState<Period>('week')
  const [anchor, setAnchor] = useState(() => nowAnchor('week'))
  const [loaded, setLoaded] = useState<{ key: string; items: PlanItem[]; muscles: MuscleRef[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { start, end } = rangeOf(period, anchor)
  // Data for another range is stale: show loading until this range arrives.
  const data = loaded?.key === start + end ? loaded : null

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    loadPlan(supabase, start, end).then(
      (d) => !cancelled && setLoaded({ key: start + end, ...d }),
      (e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)),
    )
    return () => {
      cancelled = true
    }
  }, [start, end])

  const dates = useMemo(() => {
    const out: string[] = []
    for (let d = start; d <= end; d = addDays(d, 1)) out.push(d)
    return out
  }, [start, end])
  // Columns of the tables: each day of a week, or each Monday-start week of a month.
  const columns = useMemo(() => {
    if (period === 'week') return dates.map((d) => ({ label: fmt(d, { weekday: 'narrow' }), title: fmt(d, { weekday: 'long' }), dates: [d] }))
    const weeks = [...new Set(dates.map(startOfWeek))]
    return weeks.map((w) => {
      const ds = dates.filter((d) => startOfWeek(d) === w)
      return { label: fmt(ds[0], { month: 'numeric', day: 'numeric' }), title: 'Week of ' + fmt(w, { month: 'short', day: 'numeric' }), dates: ds }
    })
  }, [period, dates])

  const move = (n: number) => setAnchor(period === 'month' ? shiftMonth(start, n) : addDays(start, 7 * n))
  const items = data?.items ?? []
  const totals = new Map<string, number>()
  for (const i of items) totals.set(i.date, (totals.get(i.date) ?? 0) + i.minutes)
  const totalMin = [...totals.values()].reduce((a, b) => a + b, 0)
  const longest = [...totals.entries()].sort((a, b) => b[1] - a[1])[0]

  return (
    <section>
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">{period === 'week' ? 'Week plan' : 'Month plan'}</h1>
        <Link to="/progress" className="text-sm text-neutral-500 underline">
          Progress
        </Link>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Segmented
          value={period}
          options={{ week: 'Week', month: 'Month' }}
          onChange={(p) => {
            setPeriod(p)
            setAnchor(p === 'month' ? start : nowAnchor('week'))
          }}
        />
        <div className="ml-auto flex items-center">
          <button type="button" onClick={() => move(-1)} className="h-10 px-3 text-xl" aria-label="Previous">
            ‹
          </button>
          <button type="button" onClick={() => setAnchor(nowAnchor(period))} className="h-10 px-2 text-sm">
            {period === 'week'
              ? `${fmt(start, { month: 'short', day: 'numeric' })} – ${fmt(end, { month: 'short', day: 'numeric' })}`
              : fmt(start, { month: 'long', year: 'numeric' })}
          </button>
          <button type="button" onClick={() => move(1)} className="h-10 px-3 text-xl" aria-label="Next">
            ›
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {!data && !error && <p className="mt-4 text-neutral-500">Loading…</p>}
      {data && items.length === 0 && (
        <p className="mt-4 text-neutral-500">Nothing planned yet. Days are generated about four weeks ahead.</p>
      )}
      {data && items.length > 0 && (
        <>
          <p className="mt-3 text-sm">
            About <b>{(totalMin / 60).toFixed(1)} h</b> over <b>{totals.size}</b> days
            {longest && (
              <>
                . Longest: <b>{fmt(longest[0], { weekday: 'short', month: 'short', day: 'numeric' })}</b>, {Math.round(longest[1])} min
              </>
            )}
            .
          </p>
          <Balance items={items} weeks={columns.length} period={period} />
          <Days items={items} dates={dates} period={period} />
          <Muscles items={items} refs={data.muscles} columns={columns} />
          <Feats items={items} columns={columns} />
          <p className="mt-6 text-xs text-neutral-500">
            Times are estimates: sets × (work + rest), lift ladders with their warm-ups and rests, timed blocks at the middle of
            their range, plus 30 s between exercises.
          </p>
        </>
      )}
    </section>
  )
}

function Segmented<K extends string>({ value, options, onChange }: { value: K; options: Record<K, string>; onChange: (k: K) => void }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg bg-neutral-100 p-1 text-sm dark:bg-neutral-800">
      {(Object.keys(options) as K[]).map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          aria-pressed={value === k}
          className={`h-9 rounded-md px-3 ${value === k ? 'bg-white font-semibold dark:bg-neutral-950' : ''}`}
        >
          {options[k]}
        </button>
      ))}
    </div>
  )
}

function Card({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="font-semibold">{title}</h2>
      {note && <p className="mt-0.5 text-xs text-neutral-500">{note}</p>}
      {children}
    </div>
  )
}

const LEGEND: [number, string][] = [
  [0, 'None'],
  [0.5, 'Half'],
  [1, 'On target'],
  [2, '2× target'],
]

/** Body map coloured by sets against a weekly target, to spot what's undertrained. */
function Balance({ items, weeks, period }: { items: PlanItem[]; weeks: number; period: Period }) {
  const [measure, setMeasure] = useState<'sets' | 'done'>('sets')
  const [all, setAll] = useState(false)
  const rows = regionBalance(items, weeks, measure)
  const colors = Object.fromEntries(
    rows.map((r) => [r.region, { fill: balanceColor(r.ratio), title: `${r.region}: ${r.perWeek} of ${r.target} sets a week` }]),
  )
  const low = rows.filter((r) => r.ratio < 0.75)
  return (
    <Card
      title="Training balance"
      note={`Sets per muscle ${period === 'month' ? 'in an average week' : 'this week'} against a weekly target. Main movers count in full, helpers by half. Tap a muscle for its numbers.`}
    >
      <div className="mt-3">
        <Segmented value={measure} options={{ sets: 'Planned', done: 'Done' }} onChange={setMeasure} />
      </div>
      <MuscleDiagram level={{}} colors={colors} label="Body map of training balance" className="mx-auto mt-3 w-full max-w-sm" />
      <div className="mt-2 flex items-center gap-2 text-xs text-neutral-500">
        <span>Under</span>
        <span
          className="h-2.5 flex-1 rounded-full"
          style={{ background: `linear-gradient(to right, ${[0, 0.5, 1, 1.5, 2].map(balanceColor).join(', ')})` }}
        />
        <span>Over</span>
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-neutral-500">
        {LEGEND.map(([, l]) => (
          <span key={l}>{l}</span>
        ))}
      </div>
      {low.length > 0 && (
        <>
          <p className="mt-4 text-sm font-medium">Undertrained</p>
          <ul className="mt-1 space-y-1">
            {(all ? low : low.slice(0, 6)).map((r) => (
              <li key={r.region} className="flex items-center gap-2 text-sm">
                <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: balanceColor(r.ratio) }} />
                <span className="flex-1 capitalize">{r.region}</span>
                <span className="text-neutral-500 tabular-nums">
                  {r.perWeek} / {r.target} sets
                </span>
              </li>
            ))}
          </ul>
          {low.length > 6 && (
            <button type="button" onClick={() => setAll(!all)} className="mt-1 text-sm text-neutral-500 underline">
              {all ? 'Show fewer' : `Show all ${low.length}`}
            </button>
          )}
        </>
      )}
    </Card>
  )
}

/** Minutes per day split by part, and (in a week) every exercise per day. */
function Days({ items, dates, period }: { items: PlanItem[]; dates: string[]; period: Period }) {
  const [open, setOpen] = useState<string | null>(null)
  const parts = dayParts(items)
  const totals = new Map<string, number>()
  for (const [d, ps] of parts) totals.set(d, ps.reduce((a, p) => a + p.minutes, 0))
  const max = Math.max(1, ...totals.values())
  const used = BLOCK_ORDER.filter((b) => items.some((i) => i.block === b))
  return (
    <Card title="Each day, by part" note={period === 'week' ? 'Tap a day for its exercises.' : undefined}>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-500">
        {used.map((b) => (
          <span key={b} className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: BLOCK_COLORS[b] }} />
            {BLOCK_LABELS[b]}
          </span>
        ))}
      </div>
      <div className="mt-3 space-y-1">
        {dates.map((d) => {
          const ps = parts.get(d) ?? []
          const total = totals.get(d) ?? 0
          const isOpen = open === d
          const dayItems = items.filter((i) => i.date === d)
          return (
            <div key={d}>
              <button
                type="button"
                disabled={!ps.length || period === 'month'}
                onClick={() => setOpen(isOpen ? null : d)}
                className="grid w-full grid-cols-[3.5rem_1fr_3.5rem] items-center gap-2 py-0.5 text-left text-xs"
                aria-expanded={period === 'week' ? isOpen : undefined}
              >
                <span className="text-neutral-500">{fmt(d, period === 'week' ? { weekday: 'short' } : { weekday: 'short', day: 'numeric' })}</span>
                <span className={`flex overflow-hidden rounded ${period === 'week' ? 'h-5' : 'h-3'}`} style={{ width: `${(total / max) * 100}%` }}>
                  {ps.map((p) => (
                    <span
                      key={p.block}
                      title={`${BLOCK_LABELS[p.block]}: ${Math.round(p.minutes)} min`}
                      style={{ flex: p.minutes, background: BLOCK_COLORS[p.block] }}
                    />
                  ))}
                </span>
                <span className="text-right tabular-nums">{total ? `${Math.round(total)} min` : '—'}</span>
              </button>
              {isOpen && (
                <div className="mb-2 rounded-xl bg-neutral-50 p-3 text-xs dark:bg-neutral-950">
                  <p className="font-medium">{dayItems[0]?.dayName}</p>
                  {ps.map((p) => (
                    <div key={p.block} className="mt-2">
                      <p className="flex justify-between font-semibold">
                        <span className="inline-flex items-center gap-1">
                          <span className="h-2 w-2 rounded-sm" style={{ background: BLOCK_COLORS[p.block] }} />
                          {BLOCK_LABELS[p.block]}
                        </span>
                        <span>{Math.round(p.minutes)} min</span>
                      </p>
                      {dayItems
                        .filter((i) => i.block === p.block)
                        .map((i) => (
                          <p key={i.position} className="flex justify-between text-neutral-500">
                            <span>{i.groupName ? `${i.groupName}: ${i.name}` : i.name}</span>
                            <span className="tabular-nums">{Math.round(i.minutes)} min</span>
                          </p>
                        ))}
                    </div>
                  ))}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {[...new Set(dayItems.flatMap((i) => i.feats))].sort((a, b) => featKind(a) - featKind(b) || a.localeCompare(b)).map((f) => (
                      <FeatChip key={f} feat={f} />
                    ))}
                  </div>
                  <Link to={`/day/${d}`} className="mt-2 inline-block underline">
                    Open the day
                  </Link>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function FeatChip({ feat }: { feat: string }) {
  const c = GROUP_COLORS[featKind(feat)]
  return (
    <span className="rounded-full border px-2 py-0.5" style={{ borderColor: c, background: `color-mix(in srgb, ${c} 14%, transparent)` }}>
      {feat}
    </span>
  )
}

type Column = { label: string; title: string; dates: string[] }

function HeatHeader({ columns, last }: { columns: Column[]; last: string }) {
  return (
    <thead>
      <tr className="text-neutral-500">
        <th className="w-32 text-left font-normal" />
        {columns.map((c) => (
          <th key={c.title} className="font-normal" title={c.title}>
            {c.label}
          </th>
        ))}
        <th className="w-16 text-right font-normal">{last}</th>
      </tr>
    </thead>
  )
}

function Cell({ value, max, color, title }: { value: number; max: number; color: string; title: string }) {
  const pct = value ? Math.round(22 + 70 * (value / max)) : 0
  return (
    <td className="p-[1px]">
      <span
        title={title}
        className="flex h-6 items-center justify-center rounded-[4px] tabular-nums"
        style={{
          background: value ? `color-mix(in srgb, ${color} ${pct}%, transparent)` : 'var(--chart-grid)',
          color: pct > 60 ? 'white' : undefined,
        }}
      >
        {value || ''}
      </span>
    </td>
  )
}

/** Sets per muscle, as a tree you open by part, laid out the way you pick. */
function Muscles({ items, refs, columns }: { items: PlanItem[]; refs: MuscleRef[]; columns: Column[] }) {
  const [view, setView] = useState<MuscleView>('parts')
  const [measure, setMeasure] = useState<'sets' | 'done'>('sets')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const cols = columns.map((c) => c.dates)
  const tree = muscleTree(items, refs, view, cols, measure)
  const max = Math.max(1, ...tree.flatMap((n) => n.values))
  const toggle = (key: string) =>
    setOpen((s) => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const rows: { node: MuscleNode; color: string }[] = []
  const walk = (nodes: MuscleNode[], color: (i: number) => string) =>
    nodes.forEach((n, i) => {
      if (n.total === 0 && n.children.length === 0) return
      const c = color(i)
      rows.push({ node: n, color: c })
      if (open.has(n.key)) walk(n.children, () => c)
    })
  walk(tree, (i) => (view === 'flat' ? GROUP_COLORS[0] : GROUP_COLORS[i % GROUP_COLORS.length]))
  return (
    <Card title="Muscles" note="Working sets (warm-ups and stretches left out). Tap a row to open it: body part, then group, then the muscle.">
      <div className="mt-3 flex flex-wrap gap-2">
        <Segmented
          value={view}
          options={Object.fromEntries(Object.entries(MUSCLE_VIEWS).map(([k, v]) => [k, v.label])) as Record<MuscleView, string>}
          onChange={(v) => {
            setView(v)
            setOpen(new Set())
          }}
        />
        <Segmented value={measure} options={{ sets: 'Planned', done: 'Done' }} onChange={setMeasure} />
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[20rem] table-fixed text-xs">
          <HeatHeader columns={columns} last="Total" />
          <tbody>
            {rows.map(({ node, color }) => {
              const canOpen = node.children.length > 0
              return (
                <tr key={node.key}>
                  <td className="py-0.5 pr-1">
                    <button
                      type="button"
                      disabled={!canOpen}
                      onClick={() => toggle(node.key)}
                      className={`flex w-full items-center gap-1 truncate text-left ${node.depth === 0 ? 'font-semibold' : ''}`}
                      style={{ paddingLeft: node.depth * 10 }}
                      aria-expanded={canOpen ? open.has(node.key) : undefined}
                    >
                      {canOpen && <span className={`inline-block transition-transform ${open.has(node.key) ? 'rotate-90' : ''}`}>›</span>}
                      <span className="truncate">{node.label}</span>
                    </button>
                  </td>
                  {node.values.map((v, i) => (
                    <Cell key={i} value={v} max={max} color={color} title={`${node.label}, ${columns[i].title}: ${v} sets`} />
                  ))}
                  <td className="text-right tabular-nums">
                    {node.total} <span className="text-neutral-500">· {node.active}×</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-neutral-500">Total is sets, then how many {columns.length > 7 ? 'weeks' : 'days'} it gets work.</p>
    </Card>
  )
}

function Feats({ items, columns }: { items: PlanItem[]; columns: Column[] }) {
  const [measure, setMeasure] = useState<'sets' | 'minutes'>('sets')
  const rows = featTable(
    items,
    columns.map((c) => c.dates),
    measure,
  )
  const max = Math.max(1, ...rows.flatMap((r) => r.values))
  return (
    <Card
      title="Feats"
      note="Work on exercises that build each feat. An exercise that builds two feats counts for both; stretches have minutes but no sets."
    >
      <div className="mt-3">
        <Segmented value={measure} options={{ sets: 'Sets', minutes: 'Minutes' }} onChange={setMeasure} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-500">
        {FEAT_KINDS.map((k, i) => (
          <span key={k.name} className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: GROUP_COLORS[i] }} />
            {k.name}
          </span>
        ))}
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[20rem] table-fixed text-xs">
          <HeatHeader columns={columns} last="Total" />
          <tbody>
            {rows.map((r) => (
              <tr key={r.feat}>
                <td className="truncate py-0.5 pr-1">{r.feat}</td>
                {r.values.map((v, i) => (
                  <Cell
                    key={i}
                    value={v}
                    max={max}
                    color={GROUP_COLORS[featKind(r.feat)]}
                    title={`${r.feat}, ${columns[i].title}: ${v} ${measure === 'sets' ? 'sets' : 'min'}`}
                  />
                ))}
                <td className="text-right tabular-nums">
                  {r.total}
                  {measure === 'minutes' ? 'm' : ''} <span className="text-neutral-500">· {r.active}×</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
