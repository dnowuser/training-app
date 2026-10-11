import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { PrescriptionForm } from '../components/PrescriptionForm'
import { listExercises } from '../lib/api'
import { addDays, formatDay, localISODate, parseISODate } from '../lib/dates'
import {
  addItem,
  applyTemplateChange,
  createExercise,
  cycleWeek,
  deleteItem,
  generatedUntil,
  generateSessions,
  loadActiveCycle,
  loadChanges,
  loadTemplate,
  startCycle,
  updateExerciseCues,
  updateCycleNotes,
  updateItem,
  updateSlot,
  WEEKDAYS,
  type PlanItem,
  type PlanSlot,
} from '../lib/plan'
import { describePrescription } from '../lib/prescription'
import { TRAINING_MAX_RULE } from '../lib/progression'
import { supabase } from '../lib/supabase'
import type { Area, Block, Change, Cycle, DayType, Exercise, Measure } from '../lib/types'

const field = 'h-11 w-full rounded-lg border border-neutral-300 bg-white px-3 dark:border-neutral-700 dark:bg-neutral-900'
const BLOCKS: Block[] = ['warmup', 'skill', 'power', 'strength', 'conditioning', 'accessory', 'mobility']
const AREAS: Area[] = ['lifting', 'jumping', 'running', 'calisthenics', 'mobility', 'accessory', 'movement']
const MEASURES: { measure: Measure; label: string }[] = [
  { measure: 'load_reps', label: 'Weight and reps' },
  { measure: 'reps', label: 'Reps' },
  { measure: 'hold', label: 'Hold (seconds)' },
  { measure: 'distance', label: 'Distance and time' },
  { measure: 'load_distance', label: 'Weight and distance' },
  { measure: 'contacts', label: 'Jump contacts' },
  { measure: 'duration', label: 'Time (done / not done)' },
]

export function PlanScreen() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'week'
  const tabs = [
    { id: 'week', label: 'Weekly plan' },
    { id: 'cycle', label: 'Cycle' },
    { id: 'changes', label: 'Change log' },
  ]
  return (
    <section>
      <h1 className="text-2xl font-semibold">Plan</h1>
      <div className="mt-3 flex gap-1 rounded-xl bg-neutral-200 p-1 dark:bg-neutral-800">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setParams(t.id === 'week' ? {} : { tab: t.id })}
            className={`h-10 flex-1 rounded-lg text-sm ${tab === t.id ? 'bg-white font-semibold dark:bg-neutral-950' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {supabase && (tab === 'cycle' ? <CycleTab /> : tab === 'changes' ? <ChangesTab /> : <WeekTab />)}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Weekly template
// ---------------------------------------------------------------------------

function WeekTab() {
  const db = supabase!
  const today = localISODate()
  const [slots, setSlots] = useState<PlanSlot[] | null>(null)
  const [weekday, setWeekday] = useState(((parseISODate(today).getDay() + 6) % 7) + 1)
  const [editing, setEditing] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    loadTemplate(db).then(setSlots, (e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [db, version])

  const slot = slots?.find((s) => s.weekday === weekday)

  /** Save a template edit, rebuild upcoming days and log it. */
  async function apply(edit: () => Promise<void>, summary: string, reason?: string, details?: Record<string, unknown>) {
    setError(null)
    try {
      await edit()
      const n = await applyTemplateChange(db, today, { summary, reason, details })
      setMessage(`Saved. ${n} upcoming ${n === 1 ? 'day' : 'days'} rebuilt; days you've started or edited by hand are kept.`)
      setEditing(null)
      setVersion((v) => v + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <>
      <p className="mt-3 text-sm text-neutral-500">
        Changes here apply to every week from today on. To change a single day, open it from the calendar.
      </p>
      <div className="mt-3 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((d, i) => (
          <button
            key={d}
            type="button"
            onClick={() => {
              setWeekday(i + 1)
              setEditing(null)
            }}
            className={`h-11 rounded-lg text-sm ${weekday === i + 1 ? 'bg-neutral-900 font-semibold text-white dark:bg-white dark:text-neutral-900' : 'bg-neutral-100 dark:bg-neutral-800'}`}
          >
            {d}
          </button>
        ))}
      </div>
      {message && <p className="mt-3 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm">{message}</p>}
      {error && <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}
      {!slots && !error && <p className="mt-4 text-neutral-500">Loading…</p>}
      {slots && !slot && <p className="mt-4 text-neutral-500">No plan for this weekday.</p>}
      {slot && (
        <>
          {editing === `slot:${slot.id}` ? (
            <SlotForm
              slot={slot}
              onCancel={() => setEditing(null)}
              onSave={(patch) => void apply(() => updateSlot(db, slot.id, patch), `${WEEKDAYS[slot.weekday - 1]} day renamed or retyped`, undefined, patch)}
            />
          ) : (
            <div className="mt-4 flex items-start justify-between gap-2">
              <div>
                <h2 className="text-xl font-semibold">{slot.name}</h2>
                <p className="text-sm text-neutral-500">
                  {slot.day_type[0].toUpperCase() + slot.day_type.slice(1)}
                  {slot.mobility ? ` · mobility ${slot.mobility}` : ''}
                </p>
              </div>
              <button type="button" onClick={() => setEditing(`slot:${slot.id}`)} className="text-sm underline">
                Edit day
              </button>
            </div>
          )}

          <ul className="mt-3 space-y-2">
            {slot.items.map((item, i) => (
              <li key={item.id}>
                {editing === item.id ? (
                  <ItemEditor
                    item={item}
                    onCancel={() => setEditing(null)}
                    onSave={(patch, cues, reason) => {
                      const same =
                        JSON.stringify(patch.prescription) === JSON.stringify(item.prescription) &&
                        patch.notes === item.notes &&
                        patch.block === item.block &&
                        patch.min_week === item.min_week &&
                        patch.max_week === item.max_week &&
                        patch.week_parity === item.week_parity &&
                        cues === (item.exercise.cues ?? '')
                      if (same) return setEditing(null)
                      void apply(
                        async () => {
                          await updateItem(db, item.id, patch)
                          if (cues !== (item.exercise.cues ?? '')) await updateExerciseCues(db, item.exercise_id, cues)
                        },
                        `${WEEKDAYS[slot.weekday - 1]}: ${item.exercise.name} changed to ${describePrescription(patch.prescription ?? item.prescription)}`,
                        reason,
                        { template_item_id: item.id, before: item.prescription, after: patch.prescription },
                      )
                    }}
                    onMove={(dir) => {
                      const other = slot.items[i + dir]
                      if (!other) return
                      void apply(
                        async () => {
                          if (item.position === other.position) {
                            await updateItem(db, item.id, { position: other.position + dir })
                          } else {
                            await updateItem(db, item.id, { position: other.position })
                            await updateItem(db, other.id, { position: item.position })
                          }
                        },
                        `${WEEKDAYS[slot.weekday - 1]}: ${item.exercise.name} moved ${dir < 0 ? 'earlier' : 'later'}`,
                      )
                    }}
                    onRemove={() => {
                      if (!window.confirm(`Remove ${item.exercise.name} from every ${WEEKDAYS[slot.weekday - 1]}?`)) return
                      void apply(() => deleteItem(db, item.id), `${WEEKDAYS[slot.weekday - 1]}: removed ${item.exercise.name}`, undefined, {
                        removed: { exercise: item.exercise.slug, block: item.block, prescription: item.prescription },
                      })
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditing(item.id)}
                    className="w-full rounded-xl border border-neutral-200 bg-white p-3 text-left active:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900"
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{item.exercise.name}</span>
                      <span className="shrink-0 text-xs text-neutral-500">{item.block}</span>
                    </span>
                    <span className="block text-sm text-neutral-600 dark:text-neutral-300">{describePrescription(item.prescription)}</span>
                    {(item.min_week || item.max_week || item.week_parity) && (
                      <span className="block text-xs text-amber-700 dark:text-amber-300">{gating(item)}</span>
                    )}
                    {item.notes && <span className="block text-xs text-neutral-500">{item.notes}</span>}
                  </button>
                )}
              </li>
            ))}
          </ul>

          {editing === 'add' ? (
            <AddItem
              onCancel={() => setEditing(null)}
              onAdd={(exercise, block, prescription, notes, reason) =>
                void apply(
                  () =>
                    addItem(db, {
                      slot_id: slot.id,
                      exercise_id: exercise.id,
                      block,
                      prescription,
                      notes: notes || null,
                      position: Math.max(0, ...slot.items.map((x) => x.position)) + 1,
                    }),
                  `${WEEKDAYS[slot.weekday - 1]}: added ${exercise.name} (${describePrescription(prescription)})`,
                  reason,
                )
              }
            />
          ) : (
            <button type="button" onClick={() => setEditing('add')} className="mt-3 h-12 w-full rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700">
              + Add an exercise
            </button>
          )}
        </>
      )}
    </>
  )
}

function gating(item: PlanItem): string {
  const parts: string[] = []
  if (item.min_week && item.max_week) parts.push(`weeks ${item.min_week}–${item.max_week}`)
  else if (item.min_week) parts.push(`from week ${item.min_week}`)
  else if (item.max_week) parts.push(`until week ${item.max_week}`)
  if (item.week_parity) parts.push(`${item.week_parity} weeks only`)
  return parts.join(', ')
}

function SlotForm({
  slot,
  onSave,
  onCancel,
}: {
  slot: PlanSlot
  onSave: (patch: { name: string; day_type: DayType; mobility: string | null }) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(slot.name)
  const [dayType, setDayType] = useState<DayType>(slot.day_type)
  const [mobility, setMobility] = useState(slot.mobility ?? '')
  return (
    <div className="mt-4 space-y-2 rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
      <input className={field} value={name} onChange={(e) => setName(e.target.value)} aria-label="Day name" />
      <select className={field} value={dayType} onChange={(e) => setDayType(e.target.value as DayType)} aria-label="Day type">
        {(['hard', 'easy', 'recovery', 'rest'] as const).map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <input className={field} value={mobility} placeholder="Mobility label" onChange={(e) => setMobility(e.target.value)} />
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="h-12 flex-1 rounded-xl bg-neutral-100 dark:bg-neutral-800">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSave({ name: name.trim(), day_type: dayType, mobility: mobility.trim() || null })}
          className="h-12 flex-1 rounded-xl bg-emerald-600 font-semibold text-white"
        >
          Save
        </button>
      </div>
    </div>
  )
}

function ItemEditor({
  item,
  onSave,
  onCancel,
  onMove,
  onRemove,
}: {
  item: PlanItem
  onSave: (patch: Parameters<typeof updateItem>[2], cues: string, reason: string) => void
  onCancel: () => void
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
}) {
  const [block, setBlock] = useState<Block>(item.block)
  const [minWeek, setMinWeek] = useState(item.min_week?.toString() ?? '')
  const [maxWeek, setMaxWeek] = useState(item.max_week?.toString() ?? '')
  const [parity, setParity] = useState(item.week_parity ?? '')
  const [cues, setCues] = useState(item.exercise.cues ?? '')
  const num = (s: string) => (s.trim() ? Number(s) : null)

  return (
    <div className="space-y-3 rounded-2xl border border-emerald-500 bg-white p-4 dark:bg-neutral-900">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{item.exercise.name}</h3>
        <div className="flex gap-1">
          <button type="button" onClick={() => onMove(-1)} className="h-10 w-10 rounded-lg bg-neutral-100 dark:bg-neutral-800" aria-label="Move earlier">
            ↑
          </button>
          <button type="button" onClick={() => onMove(1)} className="h-10 w-10 rounded-lg bg-neutral-100 dark:bg-neutral-800" aria-label="Move later">
            ↓
          </button>
        </div>
      </div>
      <label className="block text-sm">
        <span className="text-neutral-500">Block</span>
        <select className={field} value={block} onChange={(e) => setBlock(e.target.value as Block)}>
          {BLOCKS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <label>
          <span className="text-neutral-500">From week</span>
          <input className={field} inputMode="numeric" value={minWeek} onChange={(e) => setMinWeek(e.target.value)} />
        </label>
        <label>
          <span className="text-neutral-500">Until week</span>
          <input className={field} inputMode="numeric" value={maxWeek} onChange={(e) => setMaxWeek(e.target.value)} />
        </label>
        <label>
          <span className="text-neutral-500">Weeks</span>
          <select className={field} value={parity} onChange={(e) => setParity(e.target.value)}>
            <option value="">All</option>
            <option value="odd">Odd</option>
            <option value="even">Even</option>
          </select>
        </label>
      </div>
      <label className="block text-sm">
        <span className="text-neutral-500">How to do it (cues, shared by every day that uses it)</span>
        <textarea
          className="w-full rounded-lg border border-neutral-300 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900"
          rows={3}
          value={cues}
          onChange={(e) => setCues(e.target.value)}
        />
      </label>
      <PrescriptionForm
        initial={item.prescription}
        initialNotes={item.notes ?? ''}
        askReason
        onCancel={onCancel}
        onSave={(prescription, notes, reason) =>
          onSave(
            {
              prescription,
              notes: notes || null,
              block,
              min_week: num(minWeek),
              max_week: num(maxWeek),
              week_parity: (parity || null) as PlanItem['week_parity'],
            },
            cues.trim(),
            reason,
          )
        }
      />
      <button type="button" onClick={onRemove} className="text-sm text-red-600 underline">
        Remove from this weekday
      </button>
    </div>
  )
}

function AddItem({
  onAdd,
  onCancel,
}: {
  onAdd: (exercise: Exercise, block: Block, prescription: PlanItem['prescription'], notes: string, reason: string) => void
  onCancel: () => void
}) {
  const db = supabase!
  const [library, setLibrary] = useState<Exercise[]>([])
  const [exerciseId, setExerciseId] = useState('')
  const [block, setBlock] = useState<Block>('accessory')
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({ name: '', area: 'accessory' as Area, measure: 'load_reps' as Measure, cues: '' })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listExercises(db).then(
      (list) => {
        setLibrary(list)
        setExerciseId((id) => id || list[0]?.id || '')
      },
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    )
  }, [db])

  async function create() {
    try {
      const e = await createExercise(db, draft)
      setLibrary((l) => [...l, e].sort((a, b) => a.name.localeCompare(b.name)))
      setExerciseId(e.id)
      setCreating(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const exercise = library.find((e) => e.id === exerciseId)

  return (
    <div className="mt-3 space-y-3 rounded-2xl border border-emerald-500 p-4">
      <h3 className="font-semibold">Add an exercise</h3>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {creating ? (
        <div className="space-y-2">
          <input className={field} placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <select className={field} value={draft.area} onChange={(e) => setDraft({ ...draft, area: e.target.value as Area })}>
            {AREAS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select className={field} value={draft.measure} onChange={(e) => setDraft({ ...draft, measure: e.target.value as Measure })}>
            {MEASURES.map((m) => (
              <option key={m.measure} value={m.measure}>
                Log: {m.label}
              </option>
            ))}
          </select>
          <textarea
            className="w-full rounded-lg border border-neutral-300 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900"
            placeholder="How to do it (cues)"
            value={draft.cues}
            onChange={(e) => setDraft({ ...draft, cues: e.target.value })}
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => setCreating(false)} className="h-11 flex-1 rounded-xl bg-neutral-100 dark:bg-neutral-800">
              Back
            </button>
            <button type="button" disabled={!draft.name.trim()} onClick={() => void create()} className="h-11 flex-1 rounded-xl bg-emerald-600 font-semibold text-white disabled:opacity-50">
              Create exercise
            </button>
          </div>
        </div>
      ) : (
        <>
          <select className={field} value={exerciseId} onChange={(e) => setExerciseId(e.target.value)} aria-label="Exercise">
            {library.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => setCreating(true)} className="text-sm underline">
            Not listed? Create a new exercise
          </button>
          <select className={field} value={block} onChange={(e) => setBlock(e.target.value as Block)} aria-label="Block">
            {BLOCKS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <PrescriptionForm
            initial={{ sets: 3, reps: 10, rest_s: 60 }}
            askReason
            saveLabel="Add to every week"
            onCancel={onCancel}
            onSave={(p, notes, reason) => exercise && onAdd(exercise, block, p, notes, reason)}
          />
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cycle
// ---------------------------------------------------------------------------

function nextMonday(from: string): string {
  const day = parseISODate(from).getDay()
  return addDays(from, ((8 - day) % 7) || 7)
}

function CycleTab() {
  const db = supabase!
  const today = localISODate()
  const [cycle, setCycle] = useState<Cycle | null | undefined>(undefined)
  const [until, setUntil] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [draft, setDraft] = useState({ name: '', start: nextMonday(today), weeks: '12' })

  useEffect(() => {
    Promise.all([loadActiveCycle(db), generatedUntil(db)]).then(
      ([c, u]) => {
        setCycle(c)
        setUntil(u)
      },
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    )
  }, [db, version])

  if (cycle === undefined) return <p className="mt-4 text-neutral-500">{error ?? 'Loading…'}</p>

  const end = cycle ? addDays(cycle.start_date, cycle.weeks * 7 - 1) : null
  const week = cycle ? cycleWeek(cycle, today) : null

  async function generateMore() {
    if (!cycle || !end) return
    const from = until && until >= cycle.start_date ? addDays(until, 1) : cycle.start_date
    const to = addDays(from, 27) < end ? addDays(from, 27) : end
    try {
      const n = await generateSessions(db, from, to)
      setMessage(`Added ${n} sessions, ${formatDay(from)} to ${formatDay(to)}.`)
      setVersion((v) => v + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function start() {
    const name = draft.name.trim() || 'New cycle'
    if (!window.confirm(`Start "${name}" on ${formatDay(draft.start)}? The current cycle is closed.`)) return
    try {
      await startCycle(db, name, draft.start, Number(draft.weeks) || 12)
      setMessage(`${name} started; its first four weeks are planned.`)
      setVersion((v) => v + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="mt-4 space-y-4">
      {message && <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm">{message}</p>}
      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}
      {cycle ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="text-xl font-semibold">{cycle.name}</h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            {formatDay(cycle.start_date)} to {formatDay(end!)} · {cycle.weeks} weeks
          </p>
          <p className="mt-2 text-sm">
            {week ? `Week ${week} of ${cycle.weeks}` : today < cycle.start_date ? 'Starts soon' : 'Finished'}
            {week && cycle.deload_weeks.includes(week) ? ' · deload week' : ''}
          </p>
          <p className="text-sm text-neutral-500">Deload weeks: {cycle.deload_weeks.join(', ')}</p>
          <CycleNotes cycle={cycle} onSaved={() => setVersion((v) => v + 1)} onError={setError} />
          <p className="mt-2 text-sm">Planned through {until ? formatDay(until) : '—'}.</p>
          {until && end && until < end && (
            <button type="button" onClick={() => void generateMore()} className="mt-3 h-12 w-full rounded-xl bg-neutral-900 font-semibold text-white dark:bg-white dark:text-neutral-900">
              Plan the next 4 weeks
            </button>
          )}
        </div>
      ) : (
        <p className="text-neutral-500">No active cycle.</p>
      )}

      <p className="text-sm">
        Training maxes are recorded on the{' '}
        <Link to="/progress" className="underline">
          Progress
        </Link>{' '}
        tab (Record a measurement).
      </p>

      <details className="rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
        <summary className="cursor-pointer font-medium">Start a new cycle</summary>
        <div className="mt-3 space-y-2">
          <input className={field} placeholder="Name, e.g. Cycle 2" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <label className="block text-sm">
            <span className="text-neutral-500">Starts (a Monday)</span>
            <input className={field} type="date" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-500">Weeks</span>
            <input className={field} inputMode="numeric" value={draft.weeks} onChange={(e) => setDraft({ ...draft, weeks: e.target.value })} />
          </label>
          <button type="button" onClick={() => void start()} className="h-12 w-full rounded-xl bg-emerald-600 font-semibold text-white">
            Start cycle
          </button>
        </div>
      </details>
    </div>
  )
}

function CycleNotes({ cycle, onSaved, onError }: { cycle: Cycle; onSaved: () => void; onError: (m: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(cycle.notes ?? '')

  async function save() {
    try {
      await updateCycleNotes(supabase!, cycle, text.trim())
      setEditing(false)
      onSaved()
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="mt-3 space-y-2 text-sm">
      <div className="rounded-lg bg-neutral-100 p-3 dark:bg-neutral-800">
        <p className="font-medium">How training maxes move</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {TRAINING_MAX_RULE.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
      {editing ? (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-neutral-300 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900"
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditing(false)} className="h-11 flex-1 rounded-xl bg-neutral-100 dark:bg-neutral-800">
              Cancel
            </button>
            <button type="button" onClick={() => void save()} className="h-11 flex-1 rounded-xl bg-emerald-600 font-semibold text-white">
              Save notes
            </button>
          </div>
        </div>
      ) : (
        <div>
          {cycle.notes && <p className="text-neutral-600 dark:text-neutral-300">{cycle.notes}</p>}
          <button
            type="button"
            onClick={() => {
              setText(cycle.notes ?? '')
              setEditing(true)
            }}
            className="text-sm underline"
          >
            {cycle.notes ? 'Edit notes' : 'Add notes'}
          </button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Change log
// ---------------------------------------------------------------------------

const AUTHOR_STYLE: Record<Change['author'], string> = {
  user: 'bg-neutral-200 dark:bg-neutral-800',
  claude: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  app: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
}

function ChangesTab() {
  const db = supabase!
  const [changes, setChanges] = useState<Change[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadChanges(db).then(setChanges, (e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [db])

  if (!changes) return <p className="mt-4 text-neutral-500">{error ?? 'Loading…'}</p>
  return (
    <ul className="mt-4 space-y-3">
      {changes.map((c) => (
        <li key={c.id} className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
          <div className="flex items-center justify-between gap-2 text-xs text-neutral-500">
            <span className={`rounded-full px-2 py-0.5 capitalize ${AUTHOR_STYLE[c.author]}`}>{c.author === 'user' ? 'You' : c.author}</span>
            <span>{new Date(c.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
          </div>
          <p className="mt-1 text-sm font-medium">{c.summary}</p>
          {c.reason && <p className="text-sm text-neutral-600 dark:text-neutral-300">Why: {c.reason}</p>}
          {c.affects_from && <p className="text-xs text-neutral-500">From {formatDay(c.affects_from)}</p>}
        </li>
      ))}
    </ul>
  )
}
