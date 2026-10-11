import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import {
  addSession,
  cacheDay,
  cachedDay,
  deleteSet,
  insertSet,
  loadDay,
  removeSessionExercise,
  setSkipped,
  updateSession,
  updateSessionExercise,
  updateSet,
  type Day,
  type DayExercise,
  type DaySession,
  type Ladder,
  type NewSet,
} from '../lib/api'
import {
  defaultValues,
  describeLogged,
  describeTarget,
  FIELD_LABELS,
  FIELD_STEP,
  hitTarget,
  isTimedBlock,
  MEASURE_FIELDS,
  needsInput,
  restAfter,
  withLadderStep,
  type SetField,
  type SetValues,
} from '../lib/logging'
import { localISODate } from '../lib/dates'
import { markStep } from '../lib/feats'
import { describePrescription, plannedSets, type PlannedSet } from '../lib/prescription'
import { useRestTimer } from '../lib/restTimer'
import { dequeue, enqueue, isNetworkError, pendingSet, QUEUE_EVENT, queuedAsLogged, readQueue } from '../lib/offline'
import { supabase } from '../lib/supabase'
import { PrescriptionForm } from './PrescriptionForm'
import { SessionOptions } from './SessionOptions'
import type { Block, LoggedSet } from '../lib/types'

const BLOCK_LABELS: Record<Block, string> = {
  warmup: 'Warm-up',
  skill: 'Skill',
  power: 'Power',
  strength: 'Strength',
  conditioning: 'Conditioning',
  accessory: 'Accessories',
  mobility: 'Mobility',
}

/** One row on an exercise card: a planned set, a logged set, or both. */
interface Row {
  setNumber: number
  planned?: PlannedSet
  logged?: LoggedSet
}

/** The day's prescription for an exercise, following its ladder step when the step sets sets and reps. */
function prescriptionFor(item: DayExercise, ladders: Day['ladders']): DayExercise['prescription'] {
  const ladder = item.exercise.feat_id ? ladders[item.exercise.feat_id] : undefined
  return withLadderStep(item.prescription, ladder?.steps.find((s) => !s.achieved_on))
}

function rowsFor(item: DayExercise, sets: LoggedSet[], tm: number | undefined): Row[] {
  const planned = isTimedBlock(item.prescription) ? [timedSet()] : plannedSets(item.prescription, tm)
  const rows: Row[] = planned.map((p) => ({ setNumber: p.setNumber, planned: p }))
  for (const s of sets) {
    const row = rows.find((r) => r.setNumber === s.set_number && !r.logged)
    if (row) row.logged = s
    else rows.push({ setNumber: s.set_number, logged: s })
  }
  return rows.sort((a, b) => a.setNumber - b.setNumber)
}

/** A timed block (e.g. 10 min handstand practice) is one row you mark done. */
function timedSet(): PlannedSet {
  return { setNumber: 1, isWarmup: false, perSide: false }
}

/** Timestamps for started_at, completed_at and pending sets. */
const nowISO = () => new Date().toISOString()

/** In flight right now: can't be edited until the insert returns. */
const isInFlight = (s: LoggedSet) => s.id.startsWith('pending-')
/** Waiting in the offline queue: edits and deletes change the queue. */
const isQueued = (s: LoggedSet) => s.id.startsWith('queued-')

const rowKey = (itemId: string, setNumber: number) => `${itemId}:${setNumber}`

/**
 * Everything for one date: its session(s), set logging, skip and finish, and
 * (via SessionOptions) notes, media and one-off edits. Used by Today and Day detail.
 * Without signal it shows the last copy it loaded and queues new sets.
 */
export function DayView({ date }: { date: string }) {
  const [day, setDay] = useState<Day | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const [selected, setSelected] = useState(0)
  const [queue, setQueue] = useState(readQueue)

  const fetchDay = useCallback(async () => {
    if (!supabase) return
    try {
      const d = await loadDay(supabase, date)
      cacheDay(date, d)
      setDay(d)
      setOffline(false)
      setError(null)
    } catch (e) {
      const cached = isNetworkError(e) ? cachedDay(date) : null
      if (cached) {
        setDay(cached)
        setOffline(true)
      } else {
        setError(e instanceof Error ? e.message : String(e))
      }
    }
  }, [date])

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    loadDay(supabase, date).then(
      (d) => {
        if (cancelled) return
        cacheDay(date, d)
        setDay(d)
      },
      (e: unknown) => {
        if (cancelled) return
        const cached = isNetworkError(e) ? cachedDay(date) : null
        if (cached) {
          setDay(cached)
          setOffline(true)
        } else setError(e instanceof Error ? e.message : String(e))
      },
    )
    return () => {
      cancelled = true
    }
  }, [date])

  // When queued sets go out (or new ones are queued), refresh so the real rows replace the pending ones.
  useEffect(() => {
    const onQueue = () => {
      const next = readQueue()
      setQueue((prev) => {
        if (next.length < prev.length) void fetchDay()
        return next
      })
    }
    window.addEventListener(QUEUE_EVENT, onQueue)
    return () => window.removeEventListener(QUEUE_EVENT, onQueue)
  }, [fetchDay])

  // Keep the offline copy current as sets are logged.
  useEffect(() => {
    if (day) cacheDay(date, day)
  }, [date, day])

  const shown = day && {
    ...day,
    sets: [...day.sets, ...queuedAsLogged(queue.filter((q) => day.exercises.some((e) => e.id === q.set.session_exercise_id)))],
  }

  return (
    <section>
      {offline && (
        <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm">
          Offline: showing the last saved copy. Sets you log are kept on this phone and sent when you're back online.
        </p>
      )}
      {error && (
        <div className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}{' '}
          <button type="button" className="underline" onClick={() => void fetchDay()}>
            Retry
          </button>
        </div>
      )}
      {!supabase ? null : !shown ? (
        !error && <p className="mt-6 text-neutral-500">Loading…</p>
      ) : shown.sessions.length === 0 ? (
        <NoSession date={date} onAdded={() => void fetchDay()} onError={setError} />
      ) : (
        <>
          {shown.sessions.length > 1 && (
            <div className="mt-2 flex gap-2 overflow-x-auto">
              {shown.sessions.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelected(i)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${i === selected ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900' : 'bg-neutral-200 dark:bg-neutral-800'}`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
          <SessionView
            key={shown.sessions[selected]?.id}
            day={shown}
            session={shown.sessions[selected] ?? shown.sessions[0]}
            setDay={setDay}
            onError={setError}
            reload={() => void fetchDay()}
          />
        </>
      )}
    </section>
  )
}

function NoSession({ date, onAdded, onError }: { date: string; onAdded: () => void; onError: (m: string) => void }) {
  async function add() {
    try {
      await addSession(supabase!, date, 'Extra session')
      onAdded()
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <>
      <h2 className="mt-2 text-2xl font-semibold">Nothing planned</h2>
      <p className="mt-2 text-neutral-600 dark:text-neutral-300">
        No session on this day. It's a rest day, or the cycle hasn't been generated this far (Plan → Cycle).
      </p>
      <div className="mt-4 flex gap-4">
        <Link to="/calendar" className="underline">
          Open the calendar
        </Link>
        <button type="button" onClick={() => void add()} className="underline">
          Add a session
        </button>
      </div>
    </>
  )
}

function SessionView({
  day,
  session,
  setDay,
  onError,
  reload,
}: {
  day: Day
  session: DaySession
  setDay: (update: (d: Day | null) => Day | null) => void
  onError: (message: string | null) => void
  reload: () => void
}) {
  const db = supabase!
  const timer = useRestTimer()
  const [editing, setEditing] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<DayExercise | null>(null)
  // The stored prescription stays as planned; the card follows the current ladder step.
  const items = day.exercises
    .filter((e) => e.session_id === session.id)
    .map((e) => ({ ...e, prescription: prescriptionFor(e, day.ladders) }))
  const stored = new Map(day.exercises.map((e) => [e.id, e]))
  const setsFor = (id: string) => day.sets.filter((s) => s.session_exercise_id === id)

  const report = (e: unknown) => onError(e instanceof Error ? e.message : String(e))
  const patchSession = (next: DaySession) =>
    setDay((d) => d && { ...d, sessions: d.sessions.map((s) => (s.id === next.id ? next : s)) })
  const patchSets = (fn: (sets: LoggedSet[]) => LoggedSet[]) => setDay((d) => d && { ...d, sets: fn(d.sets) })

  // Every row of every exercise that isn't skipped, in order; the first unlogged one is "next".
  const allRows = items.flatMap((item) =>
    item.skipped ? [] : rowsFor(item, setsFor(item.id), day.trainingMaxes.get(item.exercise_id)).map((r) => ({ item, r })),
  )
  const next = allRows.find(({ r }) => r.planned && !r.logged)
  const nextKey = next && rowKey(next.item.id, next.r.setNumber)
  const plannedCount = allRows.filter(({ r }) => r.planned).length
  const doneCount = allRows.filter(({ r }) => r.planned && r.logged).length

  async function start() {
    try {
      patchSession(await updateSession(db, session.id, { status: 'in_progress', started_at: nowISO() }))
    } catch (e) {
      report(e)
    }
  }

  async function log(item: DayExercise, row: Row, values: SetValues, note?: string) {
    const planned = row.planned
    const measure = item.exercise.measure
    const set: NewSet = {
      session_exercise_id: item.id,
      set_number: row.setNumber,
      is_warmup: planned?.isWarmup ?? false,
      hit_target: planned ? hitTarget(planned, measure, values) : true,
      note: note || null,
      ...values,
    }
    // Show it straight away; swap in the saved row when the insert returns.
    const tempId = `pending-${crypto.randomUUID()}`
    const temp = pendingSet(tempId, set, nowISO())
    patchSets((sets) => [...sets, temp])
    setEditing(null)
    const rest = restAfter(item.prescription, planned)
    if (rest) timer.start(rest)

    try {
      const saved = await insertSet(db, set)
      patchSets((sets) => sets.map((s) => (s.id === tempId ? saved : s)))
      onError(null)
      if (session.status === 'planned') {
        patchSession(await updateSession(db, session.id, { status: 'in_progress', started_at: nowISO() }))
      }
    } catch (e) {
      patchSets((sets) => sets.filter((s) => s.id !== tempId))
      if (isNetworkError(e)) {
        // No signal: keep it on the phone and send it later (see SyncBanner).
        enqueue({ tempId: `queued-${crypto.randomUUID()}`, set, queuedAt: nowISO() })
      } else {
        timer.stop()
        report(e)
      }
    }
  }

  async function save(item: DayExercise, row: Row, values: SetValues, note: string) {
    if (!row.logged) return log(item, row, values, note)
    const hit = row.planned ? hitTarget(row.planned, item.exercise.measure, values) : true
    if (isQueued(row.logged)) {
      // Not sent yet: replace it in the queue.
      const { id, set_number, is_warmup, session_exercise_id } = row.logged
      dequeue(id)
      enqueue({
        tempId: id,
        set: { session_exercise_id, set_number, is_warmup, hit_target: hit, note: note || null, ...values },
        queuedAt: nowISO(),
      })
      setEditing(null)
      return
    }
    try {
      const saved = await updateSet(db, row.logged.id, {
        ...values,
        note: note || null,
        hit_target: row.planned ? hitTarget(row.planned, item.exercise.measure, values) : true,
      })
      patchSets((sets) => sets.map((s) => (s.id === saved.id ? saved : s)))
      setEditing(null)
    } catch (e) {
      report(e)
    }
  }

  async function remove(set: LoggedSet) {
    if (!window.confirm('Delete this logged set?')) return
    if (isQueued(set)) {
      dequeue(set.id)
      setEditing(null)
      return
    }
    try {
      await deleteSet(db, set.id)
      patchSets((sets) => sets.filter((s) => s.id !== set.id))
      setEditing(null)
    } catch (e) {
      report(e)
    }
  }

  async function toggleSkip(item: DayExercise) {
    try {
      await setSkipped(db, item.id, !item.skipped)
      setDay((d) => d && { ...d, exercises: d.exercises.map((e) => (e.id === item.id ? { ...e, skipped: !e.skipped } : e)) })
    } catch (e) {
      report(e)
    }
  }

  async function editItem(shown: DayExercise, prescription: DayExercise['prescription'], notes: string, reason: string) {
    const item = stored.get(shown.id) ?? shown
    if (JSON.stringify(prescription) === JSON.stringify(item.prescription) && (notes || null) === item.notes) {
      setEditingItem(null)
      return
    }
    try {
      await updateSessionExercise(db, item, session, { prescription, notes: notes || null }, reason)
      setEditingItem(null)
      reload()
    } catch (e) {
      report(e)
    }
  }

  async function removeItem(item: DayExercise) {
    if (setsFor(item.id).length) return onError('This exercise has logged sets, so it stays. Skip it instead.')
    if (!window.confirm(`Remove ${item.exercise.name} from this day?`)) return
    try {
      await removeSessionExercise(db, item, session)
      setEditingItem(null)
      reload()
    } catch (e) {
      report(e)
    }
  }

  async function finish() {
    const complete = doneCount >= plannedCount
    if (!complete && !window.confirm(`${doneCount} of ${plannedCount} sets logged. Finish anyway?`)) return
    try {
      // Exercises with nothing logged count as skipped.
      const untouched = items.filter((i) => !i.skipped && setsFor(i.id).length === 0)
      await Promise.all(untouched.map((i) => setSkipped(db, i.id, true)))
      setDay(
        (d) =>
          d && { ...d, exercises: d.exercises.map((e) => (untouched.some((u) => u.id === e.id) ? { ...e, skipped: true } : e)) },
      )
      patchSession(
        await updateSession(db, session.id, {
          status: complete ? 'done' : 'partial',
          started_at: session.started_at ?? nowISO(),
          completed_at: nowISO(),
        }),
      )
      timer.stop()
    } catch (e) {
      report(e)
    }
  }

  const finished = session.status === 'done' || session.status === 'partial'

  return (
    <>
      <h1 className="text-2xl leading-tight font-semibold">{session.name}</h1>
      <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
        {session.week && <Badge>Week {session.week}</Badge>}
        {session.is_deload && <Badge tone="amber">Deload</Badge>}
        <Badge>{session.day_type[0].toUpperCase() + session.day_type.slice(1)}</Badge>
        {session.slot?.mobility && <Badge>Mobility {session.slot.mobility}</Badge>}
        {finished && <Badge tone="emerald">{session.status === 'done' ? 'Done' : 'Partial'}</Badge>}
      </div>
      {session.notes && <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">{session.notes}</p>}

      {plannedCount > 0 && (
        <div className="mt-4">
          <div className="h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
            <div className="h-full bg-emerald-500" style={{ width: `${(doneCount / plannedCount) * 100}%` }} />
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            {doneCount} / {plannedCount} sets
          </p>
        </div>
      )}

      {session.status === 'planned' && items.length > 0 && (
        <button
          type="button"
          onClick={() => void start()}
          className="mt-4 h-14 w-full rounded-2xl bg-emerald-600 text-lg font-semibold text-white active:bg-emerald-700"
        >
          Start
        </button>
      )}

      <div className="mt-2">
        {items.map((item, i) => (
          <div key={item.id}>
            {item.block !== items[i - 1]?.block && (
              <h2 className="mt-6 mb-2 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
                {BLOCK_LABELS[item.block]}
              </h2>
            )}
            <ExerciseCard
              item={item}
              rows={rowsFor(item, setsFor(item.id), day.trainingMaxes.get(item.exercise_id))}
              tm={day.trainingMaxes.get(item.exercise_id)}
              nextKey={nextKey}
              editing={editing}
              setEditing={setEditing}
              onLog={(row, values) => void log(item, row, values)}
              onSave={(row, values, note) => void save(item, row, values, note)}
              onDelete={(set) => void remove(set)}
              onSkip={() => void toggleSkip(item)}
              onEdit={() => setEditingItem(item)}
              ladder={item.exercise.feat_id ? day.ladders[item.exercise.feat_id] : undefined}
              onAdvanced={reload}
            />
            {editingItem?.id === item.id && (
              <div className="mb-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
                <p className="mb-2 text-sm text-neutral-500">
                  Change {item.exercise.name} for this day only. To change it every week, use Plan.
                </p>
                <PrescriptionForm
                  initial={stored.get(item.id)?.prescription ?? item.prescription}
                  initialNotes={item.notes ?? ''}
                  askReason
                  onCancel={() => setEditingItem(null)}
                  onSave={(p, notes, reason) => void editItem(item, p, notes, reason)}
                />
                <button type="button" onClick={() => void removeItem(item)} className="mt-3 text-sm text-red-600 underline">
                  Remove from this day
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {items.length > 0 && session.status !== 'done' && (
        <button
          type="button"
          onClick={() => void finish()}
          className="mt-8 h-14 w-full rounded-2xl bg-neutral-900 text-lg font-semibold text-white dark:bg-white dark:text-neutral-900"
        >
          {session.status === 'partial' ? 'Finish again' : 'Finish session'}
        </button>
      )}

      <SessionOptions session={session} items={items} onChanged={reload} onError={(m) => onError(m)} />
    </>
  )
}

function Badge({ children, tone }: { children: ReactNode; tone?: 'amber' | 'emerald' }) {
  const color =
    tone === 'amber'
      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
      : tone === 'emerald'
        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
        : 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
  return <span className={`rounded-full px-2 py-0.5 ${color}`}>{children}</span>
}

function ExerciseCard({
  item,
  rows,
  tm,
  nextKey,
  editing,
  setEditing,
  onLog,
  onSave,
  onDelete,
  onSkip,
  onEdit,
  ladder,
  onAdvanced,
}: {
  item: DayExercise
  rows: Row[]
  tm: number | undefined
  nextKey: string | undefined
  editing: string | null
  setEditing: (key: string | null) => void
  onLog: (row: Row, values: SetValues) => void
  onSave: (row: Row, values: SetValues, note: string) => void
  onDelete: (set: LoggedSet) => void
  onSkip: () => void
  onEdit: () => void
  ladder?: Ladder
  onAdvanced: () => void
}) {
  const p = item.prescription
  const measure = item.exercise.measure
  const usesTm = p.scheme === 'ladder' || p.pct_tm !== undefined
  const timed = isTimedBlock(p)
  const allLogged = rows.every((r) => r.logged)
  const warmups = rows.filter((r) => r.planned?.isWarmup).length
  const extraKey = rowKey(item.id, Math.max(0, ...rows.map((r) => r.setNumber)) + 1)

  // Load to carry into a set the plan gives no load for: the last one logged before it.
  const carryLoad = (setNumber: number) =>
    rows
      .filter((r) => r.setNumber < setNumber && r.logged?.load_lb != null)
      .map((r) => Number(r.logged!.load_lb))
      .at(-1)

  return (
    <article
      className={`mb-3 rounded-2xl border p-4 ${item.skipped ? 'border-dashed border-neutral-300 opacity-60 dark:border-neutral-700' : 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'}`}
    >
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg leading-snug font-semibold">
            {item.exercise.name}
            {allLogged && !item.skipped && <span className="ml-1.5 text-emerald-600">✓</span>}
          </h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-300">{describePrescription(p, tm)}</p>
          {usesTm && (
            <p className="text-xs text-neutral-500">
              {tm ? `Training max ${tm} lb` : 'No training max recorded: loads are blank'}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <button type="button" onClick={onSkip} className="px-2 py-1 text-xs text-neutral-500 underline">
            {item.skipped ? 'Unskip' : 'Skip'}
          </button>
          <button type="button" onClick={onEdit} className="px-2 py-1 text-xs text-neutral-500 underline">
            Edit
          </button>
        </div>
      </header>
      {item.notes && <p className="mt-1 text-sm">{item.notes}</p>}
      {item.exercise.cues && <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">{item.exercise.cues}</p>}
      {ladder && <LadderStep ladder={ladder} onAdvanced={onAdvanced} />}

      {!item.skipped && (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => {
            const key = rowKey(item.id, row.setNumber)
            const defaults = row.planned
              ? timed
                ? timedValues(p, measure)
                : defaultValues(row.planned, measure, carryLoad(row.setNumber))
              : {}
            return (
              <li key={key}>
                {editing === key ? (
                  <SetEditor
                    measure={measure}
                    initial={row.logged ? loggedValues(row.logged) : defaults}
                    initialNote={row.logged?.note ?? ''}
                    onCancel={() => setEditing(null)}
                    onSave={(values, note) => onSave(row, values, note)}
                    onDelete={row.logged && !isInFlight(row.logged) ? () => onDelete(row.logged!) : undefined}
                  />
                ) : (
                  <SetRow
                    row={row}
                    number={row.planned?.isWarmup ? `W${row.setNumber}` : String(row.setNumber - warmups)}
                    label={timed ? describePrescription(p) : row.planned ? describeTarget(row.planned) : `Set ${row.setNumber}`}
                    isNext={key === nextKey}
                    onTap={() => (row.logged && isInFlight(row.logged) ? undefined : setEditing(key))}
                    onCheck={() =>
                      needsInput(measure, defaults) && !timed ? setEditing(key) : onLog(row, defaults)
                    }
                  />
                )}
              </li>
            )
          })}
          {editing === extraKey ? (
            <li>
              <SetEditor
                measure={measure}
                initial={lastValues(rows)}
                initialNote=""
                onCancel={() => setEditing(null)}
                onSave={(values, note) =>
                  onSave({ setNumber: Number(extraKey.split(':')[1]) }, values, note)
                }
              />
            </li>
          ) : (
            !timed && (
              <li>
                <button
                  type="button"
                  onClick={() => setEditing(extraKey)}
                  className="w-full rounded-xl py-2 text-sm text-neutral-500 active:bg-neutral-100 dark:active:bg-neutral-800"
                >
                  + Add set
                </button>
              </li>
            )
          )}
        </ul>
      )}
    </article>
  )
}

/** A timed block logs its length as seconds where the measure takes seconds. */
function timedValues(p: DayExercise['prescription'], measure: DayExercise['exercise']['measure']): SetValues {
  return (measure === 'duration' || measure === 'distance') && p.minutes ? { seconds: p.minutes * 60 } : {}
}

function loggedValues(s: LoggedSet): SetValues {
  const out: SetValues = {}
  for (const f of ['reps', 'load_lb', 'seconds', 'distance_m', 'contacts'] as const) {
    if (s[f] !== null) out[f] = Number(s[f])
  }
  return out
}

/** Prefill for an extra set: whatever was logged last, else the last planned target. */
function lastValues(rows: Row[]): SetValues {
  const last = rows.filter((r) => r.logged).at(-1)?.logged
  if (last) return loggedValues(last)
  const planned = rows.filter((r) => r.planned).at(-1)?.planned
  return planned
    ? { reps: planned.reps, load_lb: planned.loadLb, seconds: planned.seconds, distance_m: planned.distanceM, contacts: planned.contacts }
    : {}
}

/**
 * The step of the feat ladder this exercise practises (the first not yet hit),
 * how to do it, and a button to move up once it's earned.
 */
function LadderStep({ ladder, onAdvanced }: { ladder: Ladder; onAdvanced: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const main = ladder.steps.filter((s) => !s.is_bonus)
  const current = ladder.steps.find((s) => !s.achieved_on)
  if (!current) return <p className="mt-3 rounded-xl bg-emerald-500/10 p-3 text-sm">Every step of {ladder.name} is done.</p>
  const next = ladder.steps.find((s) => s.step_number > current.step_number)

  async function advance() {
    if (!current) return
    const msg = `Mark "${current.description}" as hit today?${next ? ` Your next step becomes "${next.description}".` : ''}`
    if (!window.confirm(msg)) return
    setBusy(true)
    try {
      await markStep(supabase!, ladder, current, localISODate(), '')
      onAdvanced()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  return (
    <div className="mt-3 rounded-xl border border-violet-500/40 bg-violet-500/5 p-3">
      <p className="text-xs font-semibold tracking-wide text-violet-700 uppercase dark:text-violet-300">
        Your step {current.is_bonus ? '(bonus)' : `${current.step_number} of ${main.length}`}
      </p>
      <p className="mt-0.5 font-semibold">{current.description}</p>
      {current.how && <p className="mt-1 text-sm">{current.how}</p>}
      {next && <p className="mt-1 text-xs text-neutral-500">Next: {next.description}</p>}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void advance()}
          className="h-10 rounded-lg bg-violet-600 px-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'I hit this step'}
        </button>
        <Link to={`/feats/${ladder.slug}`} className="text-xs text-neutral-500 underline">
          Whole ladder
        </Link>
      </div>
    </div>
  )
}

function SetRow({
  row,
  number,
  label,
  isNext,
  onTap,
  onCheck,
}: {
  row: Row
  number: string
  label: string
  isNext: boolean
  onTap: () => void
  onCheck: () => void
}) {
  const { planned, logged } = row
  const pending = logged && (isInFlight(logged) || isQueued(logged))

  return (
    <div
      className={`flex items-center gap-3 rounded-xl px-3 py-2 ${isNext ? 'bg-emerald-500/10 ring-2 ring-emerald-500' : 'bg-neutral-100 dark:bg-neutral-800/60'}`}
    >
      <span className="w-7 shrink-0 text-sm text-neutral-500 tabular-nums">
        {number}
      </span>
      <button type="button" onClick={onTap} className="min-w-0 flex-1 py-1 text-left">
        {logged ? (
          <>
            <span className="block text-base font-medium">{describeLogged(logged)}</span>
            {planned && <span className="block text-xs text-neutral-500">Target {label}</span>}
            {logged.note && <span className="block text-xs text-neutral-500 italic">{logged.note}</span>}
            {isQueued(logged) && <span className="block text-xs text-amber-600">Saved on this phone, sends when online</span>}
          </>
        ) : (
          <span className={`block text-base ${planned?.isWarmup ? 'text-neutral-500' : 'font-medium'}`}>{label}</span>
        )}
      </button>
      {logged ? (
        <span
          aria-label={logged.hit_target === false ? 'Logged, missed target' : 'Logged'}
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl text-white ${pending ? 'bg-neutral-400' : logged.hit_target === false ? 'bg-amber-500' : 'bg-emerald-600'}`}
        >
          ✓
        </span>
      ) : (
        <button
          type="button"
          onClick={onCheck}
          aria-label={`Log ${label}`}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-emerald-600 text-xl text-emerald-600 active:bg-emerald-600 active:text-white"
        >
          ✓
        </button>
      )}
    </div>
  )
}

function SetEditor({
  measure,
  initial,
  initialNote,
  onSave,
  onCancel,
  onDelete,
}: {
  measure: DayExercise['exercise']['measure']
  initial: SetValues
  initialNote: string
  onSave: (values: SetValues, note: string) => void
  onCancel: () => void
  onDelete?: () => void
}) {
  const fields = MEASURE_FIELDS[measure]
  const [text, setText] = useState<Record<SetField, string>>(() => {
    const out = {} as Record<SetField, string>
    for (const f of fields) out[f] = initial[f] !== undefined ? String(initial[f]) : ''
    return out
  })
  const [note, setNote] = useState(initialNote)

  const bump = (f: SetField, by: number) =>
    setText((t) => ({ ...t, [f]: String(Math.max(0, (Number(t[f]) || 0) + by)) }))

  function submit() {
    const values: SetValues = {}
    for (const f of fields) {
      const n = Number(text[f])
      if (text[f].trim() !== '' && Number.isFinite(n)) values[f] = n
    }
    onSave(values, note.trim())
  }

  return (
    <div className="rounded-xl bg-neutral-100 p-3 dark:bg-neutral-800/60">
      {fields.map((f) => (
        <div key={f} className="mb-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => bump(f, -FIELD_STEP[f])}
            className="h-12 w-12 shrink-0 rounded-xl bg-white text-2xl dark:bg-neutral-900"
            aria-label={`Less ${FIELD_LABELS[f]}`}
          >
            −
          </button>
          <input
            inputMode="decimal"
            value={text[f]}
            onChange={(e) => setText((t) => ({ ...t, [f]: e.target.value }))}
            aria-label={FIELD_LABELS[f]}
            className="h-12 min-w-0 flex-1 rounded-xl border border-neutral-300 bg-white text-center text-xl font-semibold tabular-nums dark:border-neutral-700 dark:bg-neutral-900"
          />
          <span className="w-16 shrink-0 text-sm text-neutral-500">{FIELD_LABELS[f]}</span>
          <button
            type="button"
            onClick={() => bump(f, FIELD_STEP[f])}
            className="h-12 w-12 shrink-0 rounded-xl bg-white text-2xl dark:bg-neutral-900"
            aria-label={`More ${FIELD_LABELS[f]}`}
          >
            +
          </button>
        </div>
      ))}
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional)"
        className="mb-3 h-11 w-full rounded-xl border border-neutral-300 bg-white px-3 dark:border-neutral-700 dark:bg-neutral-900"
      />
      <div className="flex gap-2">
        {onDelete && (
          <button type="button" onClick={onDelete} className="h-12 rounded-xl px-3 text-sm text-red-600">
            Delete
          </button>
        )}
        <button type="button" onClick={onCancel} className="h-12 flex-1 rounded-xl bg-white font-medium dark:bg-neutral-900">
          Cancel
        </button>
        <button type="button" onClick={submit} className="h-12 flex-1 rounded-xl bg-emerald-600 font-semibold text-white">
          Save
        </button>
      </div>
    </div>
  )
}
