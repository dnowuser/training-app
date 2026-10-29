import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
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
  updateSessionNotes,
  updateSet,
  updateSetRpe,
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
  pacePerMile,
  timeFromPace,
  restAfter,
  withLadderStep,
  type SetField,
  type SetValues,
} from '../lib/logging'
import { localISODate } from '../lib/dates'
import { exerciseLevels } from '../lib/muscles'
import { exerciseFills } from '../lib/overview'
import { markStep } from '../lib/feats'
import { describePrescription, formatDuration, plannedSets, type PlannedSet } from '../lib/prescription'
import { parseTime } from '../lib/progress'
import {
  describeLastTime,
  nextLoad,
  readyToMoveUp,
  RPE_OPTIONS,
  type PastSession,
} from '../lib/progression'
import { useRestTimer } from '../lib/restTimer'
import { addToOutbox, applyOutbox, OUTBOX_EVENT, readOutbox } from '../lib/outbox'
import { applyTrainingMaxes } from '../lib/finish'
import { dequeue, enqueue, isNetworkError, pendingSet, QUEUE_EVENT, queuedAsLogged, readQueue } from '../lib/offline'
import { supabase } from '../lib/supabase'
import { PrescriptionForm } from './PrescriptionForm'
import { AnatomyMap } from './AnatomyMap'
import { MuscleDiagram } from './MuscleDiagram'
import { sectionsOf } from '../lib/sections'
import { SessionOptions } from './SessionOptions'
import type { Block, FeatRef, LoggedSet } from '../lib/types'

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

/** Feats a session's exercises build toward, most-trained first. */
function featsFor(items: DayExercise[], links: Record<string, FeatRef[]>): FeatRef[] {
  const count = new Map<string, { feat: FeatRef; n: number }>()
  for (const i of items) {
    if (i.skipped) continue
    for (const f of links[i.exercise_id] ?? []) count.set(f.id, { feat: f, n: (count.get(f.id)?.n ?? 0) + 1 })
  }
  return [...count.values()].sort((a, b) => b.n - a.n).map((c) => c.feat)
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
/** A loaded day with changes still waiting to send laid over it, so a saved copy shows what you did. */
function withPending(d: Day): Day {
  const items = readOutbox()
  if (!items.length) return d
  return {
    ...d,
    sets: applyOutbox(d.sets, 'sets', items),
    sessions: applyOutbox(d.sessions, 'sessions', items),
    exercises: applyOutbox(d.exercises, 'session_exercises', items),
  }
}

export function DayView({ date }: { date: string }) {
  const [day, setDay] = useState<Day | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const [selected, setSelected] = useState(0)
  const [queue, setQueue] = useState(readQueue)

  const fetchDay = useCallback(async () => {
    if (!supabase) return
    try {
      const d = withPending(await loadDay(supabase, date))
      cacheDay(date, d)
      setDay(d)
      setOffline(false)
      setError(null)
    } catch (e) {
      const saved = isNetworkError(e) ? cachedDay(date) : null
      const cached = saved && withPending(saved)
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
      (loaded) => {
        if (cancelled) return
        const d = withPending(loaded)
        cacheDay(date, d)
        setDay(d)
      },
      (e: unknown) => {
        if (cancelled) return
        const saved = isNetworkError(e) ? cachedDay(date) : null
        const cached = saved && withPending(saved)
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
    let outboxSize = readOutbox().length
    const onOutbox = () => {
      const n = readOutbox().length
      if (n < outboxSize && n === 0) void fetchDay()
      outboxSize = n
    }
    window.addEventListener(QUEUE_EVENT, onQueue)
    window.addEventListener(OUTBOX_EVENT, onOutbox)
    return () => {
      window.removeEventListener(QUEUE_EVENT, onQueue)
      window.removeEventListener(OUTBOX_EVENT, onOutbox)
    }
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
  const [tmNotes, setTmNotes] = useState<string[]>([])
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

  // Every work row of every exercise that isn't skipped, in order; the first unlogged one is "next".
  // Warm-up sets are optional: they're folded away and don't count toward what's left.
  const allRows = items.flatMap((item) =>
    item.skipped
      ? []
      : rowsFor(item, setsFor(item.id), day.trainingMaxes.get(item.exercise_id))
          .filter((r) => !r.planned?.isWarmup)
          .map((r) => ({ item, r })),
  )
  const next = allRows.find(({ r }) => r.planned && !r.logged)
  const nextKey = next && rowKey(next.item.id, next.r.setNumber)
  // The exercise whose set is open for editing: the first one with sets left that isn't a timed block.
  const focusId = allRows.find(({ item, r }) => r.planned && !r.logged && !isTimedBlock(item.prescription))?.item.id
  const plannedCount = allRows.filter(({ r }) => r.planned).length
  const doneCount = allRows.filter(({ r }) => r.planned && r.logged).length

  /** Try a change online; without signal, show it now and send it later. */
  async function act(online: () => Promise<void>, offline: () => void) {
    try {
      await online()
    } catch (e) {
      if (isNetworkError(e)) offline()
      else report(e)
    }
  }

  /** Change the session on this phone and queue the same change for the server. */
  function patchSessionLater(patch: Partial<DaySession>) {
    patchSession({ ...session, ...patch })
    addToOutbox({ kind: 'update', table: 'sessions', id: session.id, patch })
  }

  async function start() {
    const patch = { status: 'in_progress' as const, started_at: nowISO() }
    await act(
      async () => patchSession(await updateSession(db, session.id, patch)),
      () => patchSessionLater(patch),
    )
  }

  async function log(item: DayExercise, row: Row, values: SetValues, note?: string, rpe?: number | null) {
    const planned = row.planned
    const measure = item.exercise.measure
    const set: NewSet = {
      session_exercise_id: item.id,
      set_number: row.setNumber,
      is_warmup: planned?.isWarmup ?? false,
      hit_target: planned ? hitTarget(planned, measure, values) : true,
      note: note || null,
      rpe: rpe ?? null,
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
        if (session.status === 'planned') patchSessionLater({ status: 'in_progress', started_at: nowISO() })
      } else {
        timer.stop()
        report(e)
      }
    }
  }

  async function save(item: DayExercise, row: Row, values: SetValues, note: string, rpe: number | null) {
    if (!row.logged) return log(item, row, values, note, rpe)
    const hit = row.planned ? hitTarget(row.planned, item.exercise.measure, values) : true
    if (isQueued(row.logged)) {
      // Not sent yet: replace it in the queue.
      const { id, set_number, is_warmup, session_exercise_id } = row.logged
      dequeue(id)
      enqueue({
        tempId: id,
        set: { session_exercise_id, set_number, is_warmup, hit_target: hit, note: note || null, rpe, ...values },
        queuedAt: nowISO(),
      })
      setEditing(null)
      return
    }
    const id = row.logged.id
    const patch = { ...values, note: note || null, rpe, hit_target: hit }
    await act(
      async () => {
        const saved = await updateSet(db, id, patch)
        patchSets((sets) => sets.map((s) => (s.id === saved.id ? saved : s)))
        setEditing(null)
      },
      () => {
        patchSets((sets) => sets.map((s) => (s.id === id ? { ...s, ...patch } : s)))
        addToOutbox({ kind: 'update', table: 'sets', id, patch })
        setEditing(null)
      },
    )
  }

  /** One tap on an RPE chip right after logging a set. */
  async function setRpe(set: LoggedSet, rpe: number) {
    if (isInFlight(set)) return
    if (isQueued(set)) {
      const queued = readQueue().find((q) => q.tempId === set.id)
      if (!queued) return
      dequeue(set.id)
      enqueue({ ...queued, set: { ...queued.set, rpe } })
      return
    }
    patchSets((sets) => sets.map((s) => (s.id === set.id ? { ...s, rpe } : s)))
    try {
      await updateSetRpe(db, set.id, rpe)
    } catch (e) {
      if (isNetworkError(e)) return addToOutbox({ kind: 'update', table: 'sets', id: set.id, patch: { rpe } })
      report(e)
    }
  }

  /** Delete a logged set. Unchecking skips the question; the trash keeps the row either way. */
  async function remove(set: LoggedSet, ask = true) {
    if (ask && !window.confirm('Delete this logged set?')) return
    if (isQueued(set)) {
      dequeue(set.id)
      setEditing(null)
      return
    }
    await act(
      async () => {
        await deleteSet(db, set.id)
        patchSets((sets) => sets.filter((s) => s.id !== set.id))
        setEditing(null)
      },
      () => {
        patchSets((sets) => sets.filter((s) => s.id !== set.id))
        addToOutbox({ kind: 'delete', table: 'sets', id: set.id })
        setEditing(null)
      },
    )
  }

  async function toggleSkip(item: DayExercise) {
    const skipped = !item.skipped
    const show = () => setDay((d) => d && { ...d, exercises: d.exercises.map((e) => (e.id === item.id ? { ...e, skipped } : e)) })
    await act(
      async () => {
        await setSkipped(db, item.id, skipped)
        show()
      },
      () => {
        show()
        addToOutbox({ kind: 'update', table: 'session_exercises', id: item.id, patch: { skipped } })
      },
    )
  }

  /** A note typed on a card joins the day's notes as "Exercise: note", like one from the Edit form. */
  async function addNote(item: DayExercise, text: string) {
    const line = `${item.exercise.name}: ${text}`
    const next = session.notes ? `${session.notes}\n\n${line}` : line
    await act(
      async () => {
        await updateSessionNotes(db, session.id, next)
        patchSession({ ...session, notes: next })
      },
      () => patchSessionLater({ notes: next }),
    )
  }

  async function editItem(shown: DayExercise, prescription: DayExercise['prescription'], notes: string, reason: string) {
    const item = stored.get(shown.id) ?? shown
    const changed = JSON.stringify(prescription) !== JSON.stringify(item.prescription) || (notes || null) !== item.notes
    try {
      if (changed) await updateSessionExercise(db, item, session, { prescription, notes: notes || null }, reason)
      // A note typed here is a request: keep it with the day's notes so it shows in Notes and on the day.
      if (reason) {
        const line = `${item.exercise.name}: ${reason}`
        const next = session.notes ? `${session.notes}\n\n${line}` : line
        await updateSessionNotes(db, session.id, next)
        patchSession({ ...session, notes: next })
      }
      setEditingItem(null)
      if (changed) reload()
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
    // Exercises with nothing logged count as skipped.
    const untouched = items.filter((i) => !i.skipped && setsFor(i.id).length === 0)
    const patch = { status: complete ? ('done' as const) : ('partial' as const), started_at: session.started_at ?? nowISO(), completed_at: nowISO() }
    const showSkipped = () =>
      setDay((d) => d && { ...d, exercises: d.exercises.map((e) => (untouched.some((u) => u.id === e.id) ? { ...e, skipped: true } : e)) })
    timer.stop()
    // Sets still waiting to send can't move the training max yet: work it out once they're in.
    const waiting = items.some((i) => setsFor(i.id).some((st) => isInFlight(st) || isQueued(st)))
    await act(
      async () => {
        await Promise.all(untouched.map((i) => setSkipped(db, i.id, true)))
        showSkipped()
        patchSession(await updateSession(db, session.id, patch))
        if (waiting) {
          addToOutbox({ kind: 'training-max', date: session.date, sessionId: session.id })
          setTmNotes(['Training maxes update once the sets saved on this phone are sent.'])
        } else setTmNotes(await applyTrainingMaxes(db, { ...day, exercises: day.exercises.filter((e) => !untouched.some((u) => u.id === e.id)) }, session.id))
      },
      () => {
        showSkipped()
        for (const i of untouched) addToOutbox({ kind: 'update', table: 'session_exercises', id: i.id, patch: { skipped: true } })
        patchSessionLater(patch)
        addToOutbox({ kind: 'training-max', date: session.date, sessionId: session.id })
        setTmNotes(['No signal: finished on this phone. Training maxes update when it’s back online.'])
      },
    )
  }

  const finished = session.status === 'done' || session.status === 'partial'


  const sections = sectionsOf(items)
  // A section or group is open until all its sets are logged; a tap overrides that either way.
  const [openOverride, setOpenOverride] = useState<Record<string, boolean>>({})
  const rowsOf = (item: DayExercise) => rowsFor(item, setsFor(item.id), day.trainingMaxes.get(item.exercise_id))
  const progress = (list: DayExercise[]) => {
    const rows = list.filter((it) => !it.skipped).flatMap((it) => rowsOf(it).filter((r) => r.planned && !r.planned.isWarmup))
    return { done: rows.filter((r) => r.logged).length, total: rows.length }
  }
  const complete = (list: DayExercise[]) => {
    const { done, total } = progress(list)
    return total > 0 && done === total
  }
  const isOpen = (key: string, list: DayExercise[]) => openOverride[key] ?? !complete(list)
  const toggle = (key: string, list: DayExercise[]) => setOpenOverride((o) => ({ ...o, [key]: !isOpen(key, list) }))

  const renderItem = (item: DayExercise) => (
    <div key={item.id}>
      <ExerciseCard
        item={item}
        rows={rowsOf(item)}
        tm={day.trainingMaxes.get(item.exercise_id)}
        nextKey={nextKey}
        focused={item.id === focusId}
        editing={editing}
        setEditing={setEditing}
        onLog={(row, values) => void log(item, row, values)}
        onSave={(row, values, note, rpe) => void save(item, row, values, note, rpe)}
        onRpe={(set, rpe) => void setRpe(set, rpe)}
        history={day.history[item.exercise.slug] ?? []}
        feats={day.exerciseFeats[item.exercise_id] ?? []}
        onDelete={(set) => void remove(set)}
        onUncheck={(set) => void remove(set, false)}
        onSkip={() => void toggleSkip(item)}
        onEdit={() => setEditingItem(editingItem?.id === item.id ? null : item)}
        isEditing={editingItem?.id === item.id}
        notes={notesFor(session.notes, item.exercise.name)}
        onNote={(text) => addNote(item, text)}
        ladder={item.exercise.feat_id ? day.ladders[item.exercise.feat_id] : undefined}
        onAdvanced={reload}
      />
      {editingItem?.id === item.id && (
        <EditPanel name={item.exercise.name} onClose={() => setEditingItem(null)}>
          <PrescriptionForm
            initial={stored.get(item.id)?.prescription ?? item.prescription}
            initialNotes={item.notes ?? ''}
            askReason
            onCancel={() => setEditingItem(null)}
            onSave={(p, notes, reason) => editItem(item, p, notes, reason)}
          />
          <button type="button" onClick={() => void removeItem(item)} className="mt-3 text-sm text-red-600 underline">
            Remove from this day
          </button>
        </EditPanel>
      )}
    </div>
  )

  return (
    <>
      <h1 className="text-2xl leading-tight font-semibold">{session.name}</h1>
      <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
        {session.week && <Badge>Week {session.week}</Badge>}
        {session.is_deload && <Badge tone="amber">Deload</Badge>}
        {session.slot?.mobility && <Badge>Mobility {session.slot.mobility}</Badge>}
        {finished && <Badge tone="emerald">{session.status === 'done' ? 'Done' : 'Partial'}</Badge>}
      </div>
      {session.notes && <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">{session.notes}</p>}
      {(() => {
        const today = featsFor(items, day.exerciseFeats)
        return today.length > 0 ? (
          <p className="mt-2 text-sm">
            <span className="text-neutral-500">Builds today: </span>
            {today.map((f) => f.name).join(', ')}
          </p>
        ) : null
      })()}

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
        {sections.map((section) => (
          <Fold
            key={section.key}
            title={BLOCK_LABELS[section.block]}
            {...progress(section.items)}
            open={isOpen(section.key, section.items)}
            onToggle={() => toggle(section.key, section.items)}
            level="section"
          >
            {section.groups.map((group) =>
              group.name ? (
                <Fold
                  key={group.key}
                  title={group.name}
                  {...progress(group.items)}
                  open={isOpen(group.key, group.items)}
                  onToggle={() => toggle(group.key, group.items)}
                  level="group"
                >
                  {group.items.map(renderItem)}
                </Fold>
              ) : (
                group.items.map(renderItem)
              ),
            )}
          </Fold>
        ))}
      </div>

      {tmNotes.length > 0 && (
        <div className="mt-6 rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-4 text-sm">
          <p className="font-semibold">Next session's loads</p>
          <ul className="mt-1 space-y-1">
            {tmNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}

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

function Fold({
  title,
  done,
  total,
  open,
  onToggle,
  level,
  children,
}: {
  title: string
  done: number
  total: number
  open: boolean
  onToggle: () => void
  level: 'section' | 'group'
  children: ReactNode
}) {
  const finished = total > 0 && done === total
  return (
    <div className={level === 'group' ? 'mb-3 rounded-2xl border border-neutral-200 px-3 pb-1 dark:border-neutral-800' : ''}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`flex w-full items-center gap-2 text-left ${
          level === 'section'
            ? 'mt-6 mb-2 min-h-11 text-xs font-semibold tracking-wide text-neutral-500 uppercase'
            : 'min-h-12 text-base font-semibold'
        }`}
      >
        <span aria-hidden className={`inline-block transition-transform ${open ? 'rotate-90' : ''}`}>
          ›
        </span>
        <span className="flex-1">{title}</span>
        {total > 0 && (
          <span className={`text-xs font-normal normal-case ${finished ? 'text-emerald-600' : 'text-neutral-500'}`}>
            {finished ? '✓ ' : ''}
            {done}/{total}
          </span>
        )}
      </button>
      {open && children}
    </div>
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
  focused,
  editing,
  setEditing,
  onLog,
  onSave,
  onDelete,
  onUncheck,
  onSkip,
  onEdit,
  isEditing,
  notes,
  onNote,
  ladder,
  onAdvanced,
  onRpe,
  history,
  feats,
}: {
  item: DayExercise
  rows: Row[]
  tm: number | undefined
  nextKey: string | undefined
  focused: boolean
  editing: string | null
  setEditing: (key: string | null) => void
  onLog: (row: Row, values: SetValues) => void
  onSave: (row: Row, values: SetValues, note: string, rpe: number | null) => void
  onRpe: (set: LoggedSet, rpe: number) => void
  history: PastSession[]
  feats: FeatRef[]
  onDelete: (set: LoggedSet) => void
  onUncheck: (set: LoggedSet) => void
  onSkip: () => void
  onEdit: () => void
  isEditing: boolean
  notes: string[]
  onNote: (text: string) => Promise<void>
  ladder?: Ladder
  onAdvanced: () => void
}) {
  const p = item.prescription
  const [showMuscles, setShowMuscles] = useState(false)
  // Tap the name to fold the whole card; warm-ups stay folded unless opened.
  const [collapsed, setCollapsed] = useState(() => rows.some((r) => !r.planned?.isWarmup) && rows.every((r) => r.planned?.isWarmup || r.logged))
  const [showWarmups, setShowWarmups] = useState(false)
  const last = history[0]
  const suggestion = MEASURE_FIELDS[item.exercise.measure].includes('load_lb') ? nextLoad(p, last) : null
  // RPE is asked for on work sets, not warm-ups, timed blocks or mobility.
  const asksRpe = item.block !== 'warmup' && item.block !== 'mobility'
  const measure = item.exercise.measure
  const usesTm = p.scheme === 'ladder' || p.pct_tm !== undefined
  const timed = isTimedBlock(p)
  const allLogged = rows.every((r) => r.logged)
  // Done once every work set is in (warm-ups are optional); the card folds itself then.
  const workRows = rows.filter((r) => !r.planned?.isWarmup)
  const done = workRows.length > 0 && workRows.every((r) => r.logged)
  const [wasDone, setWasDone] = useState(done)
  if (done !== wasDone) {
    setWasDone(done)
    setCollapsed(done)
  }
  const warmups = rows.filter((r) => r.planned?.isWarmup).length
  const extraKey = rowKey(item.id, Math.max(0, ...rows.map((r) => r.setNumber)) + 1)
  // The first set of the exercise you're on opens on the card. Once a set is checked,
  // the rest stay one-line rows (tap one to open it).
  const firstOpen = rows.find((r) => r.planned && !r.logged && !r.planned.isWarmup)
  const started = rows.some((r) => r.logged)
  // Tapping the open set's header folds it to a one-line row like the others.
  const [folded, setFolded] = useState<string | null>(null)
  const activeKey =
    timed || !firstOpen || started
      ? undefined
      : focused || nextKey?.startsWith(`${item.id}:`)
        ? rowKey(item.id, firstOpen.setNumber)
        : undefined

  // Load to carry into a set the plan gives no load for: the last one logged before it.
  const carryLoad = (setNumber: number) =>
    rows
      .filter((r) => r.setNumber < setNumber && r.logged?.load_lb != null)
      .map((r) => Number(r.logged!.load_lb))
      .at(-1) ?? suggestion?.load

  return (
    <article
      className={`mb-3 rounded-2xl border p-4 ${item.skipped ? 'border-dashed border-neutral-300 opacity-60 dark:border-neutral-700' : 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'}`}
    >
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg leading-snug font-semibold">
            <button type="button" onClick={() => setCollapsed(!collapsed)} aria-expanded={!collapsed} className="text-left">
              {item.exercise.name}
              {allLogged && !item.skipped && <span className="ml-1.5 text-emerald-600">✓</span>}
              <span aria-hidden className={`ml-1.5 inline-block text-sm text-neutral-400 transition-transform ${collapsed ? '' : 'rotate-90'}`}>
                ›
              </span>
            </button>
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
          <button
            type="button"
            onClick={onEdit}
            aria-expanded={isEditing}
            className={`px-2 py-1 text-xs underline ${isEditing ? 'font-semibold text-emerald-700 dark:text-emerald-400' : 'text-neutral-500'}`}
          >
            {isEditing ? 'Editing ↓' : 'Edit'}
          </button>
        </div>
      </header>
      {!collapsed && (
        <>
      {item.notes && <p className="mt-1 text-sm">{item.notes}</p>}
      {(item.exercise.muscles?.length > 0 || feats.length > 0) && (
        <p className="mt-2 text-xs leading-relaxed">
          {item.exercise.muscles?.length > 0 && (
            <button type="button" onClick={() => setShowMuscles(!showMuscles)} className="text-left text-neutral-500">
              Works {item.exercise.muscles.join(', ')} <span className="underline">{showMuscles ? 'hide' : 'see muscles'}</span>
            </button>
          )}
          {feats.length > 0 && (
            <span className="block">
              <span className="text-neutral-500">Builds </span>
              {feats.map((f, i) => (
                <span key={f.id}>
                  {i > 0 && ', '}
                  <Link to={`/feats/${f.slug}`} className="text-violet-700 underline dark:text-violet-300">
                    {f.name}
                  </Link>
                </span>
              ))}
            </span>
          )}
        </p>
      )}
      {showMuscles &&
        (item.exercise.muscle_detail?.length ? (
          <AnatomyMap fills={exerciseFills(item.exercise.muscle_detail)} label={`Muscles ${item.exercise.name} works`} className="mx-auto mt-2 w-full max-w-xs" />
        ) : (
          <MuscleDiagram level={exerciseLevels(item.exercise.muscles)} label={`Muscles ${item.exercise.name} works`} className="mx-auto mt-2 w-full max-w-[16rem]" />
        ))}
      {item.exercise.cues && <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">{item.exercise.cues}</p>}
      <Link to={`/exercises/${item.exercise.slug}`} className="mt-1 inline-block text-xs text-neutral-500 underline">
        More about {item.exercise.name.toLowerCase()}
      </Link>
      {last && (
        <p className="mt-2 text-sm">
          <span className="text-neutral-500">Last time ({formatShort(last.date)}):</span> {describeLastTime(last)}
          {suggestion && <span className="block font-medium text-emerald-700 dark:text-emerald-400">Today: {suggestion.load} lb · {suggestion.note}</span>}
        </p>
      )}
      {ladder && <LadderStep ladder={ladder} history={history} onAdvanced={onAdvanced} />}

      {!item.skipped && (
        <ul className="mt-3 space-y-2">
          {warmups > 0 && (
            <li>
              <button
                type="button"
                onClick={() => setShowWarmups(!showWarmups)}
                aria-expanded={showWarmups}
                className="flex w-full items-center gap-1 rounded-xl px-3 py-1.5 text-left text-xs text-neutral-500 active:bg-neutral-100 dark:active:bg-neutral-800"
              >
                <span className={`inline-block transition-transform ${showWarmups ? 'rotate-90' : ''}`}>›</span>
                Warm-ups ({rows.filter((r) => r.planned?.isWarmup && r.logged).length}/{warmups}):{' '}
                {rows
                  .filter((r) => r.planned?.isWarmup)
                  .map((r) => describeTarget(r.planned!))
                  .join(' · ')}
              </button>
            </li>
          )}
          {rows.filter((row) => showWarmups || !row.planned?.isWarmup).map((row) => {
            const key = rowKey(item.id, row.setNumber)
            const defaults = row.planned
              ? timed
                ? timedValues(p, measure)
                : defaultValues(row.planned, measure, carryLoad(row.setNumber))
              : {}
            return (
              <li key={key}>
                {/* The set you're on is open on the card: change weight, reps or RPE and log it in one tap. */}
                {editing !== key && key === activeKey && folded !== key ? (
                  <SetEditor
                    key={`${key}:${defaults.load_lb ?? ''}`}
                    measure={measure}
                    initial={defaults}
                    initialNote=""
                    initialRpe={null}
                    asksRpe={asksRpe && !row.planned?.isWarmup}
                    active={{
                      number: row.planned?.isWarmup ? `W${row.setNumber}` : String(row.setNumber - warmups),
                      target: row.planned ? describeTarget(row.planned) : '',
                      isNext: key === nextKey,
                    }}
                    onCollapse={() => setFolded(key)}
                    onSave={(values, note, rpe) => onSave(row, values, note, rpe)}
                  />
                ) : editing === key ? (
                  <SetEditor
                    measure={measure}
                    initial={row.logged ? loggedValues(row.logged) : defaults}
                    initialNote={row.logged?.note ?? ''}
                    initialRpe={row.logged?.rpe ?? null}
                    asksRpe={asksRpe && !row.planned?.isWarmup}
                    onCancel={() => setEditing(null)}
                    onCollapse={() => setEditing(null)}
                    onSave={(values, note, rpe) => onSave(row, values, note, rpe)}
                    onDelete={row.logged && !isInFlight(row.logged) ? () => onDelete(row.logged!) : undefined}
                  />
                ) : !row.logged && row.planned && !timed ? (
                  // Every other open set: weight, reps and RPE right on the row, one tap on ✓ to log.
                  <QuickRow
                    key={`${key}:${defaults.load_lb ?? ''}`}
                    measure={measure}
                    number={row.planned.isWarmup ? `W${row.setNumber}` : String(row.setNumber - warmups)}
                    target={describeTarget(row.planned)}
                    initial={defaults}
                    asksRpe={asksRpe && !row.planned.isWarmup}
                    isNext={key === nextKey}
                    onExpand={() => {
                      setFolded(null)
                      setEditing(key)
                    }}
                    onLog={(values, rpe) => onSave(row, values, '', rpe)}
                  />
                ) : (
                  <SetRow
                    row={row}
                    number={row.planned?.isWarmup ? `W${row.setNumber}` : String(row.setNumber - warmups)}
                    label={timed ? describePrescription(p) : row.planned ? describeTarget(row.planned) : `Set ${row.setNumber}`}
                    isNext={key === nextKey}
                    asksRpe={asksRpe && !timed && !row.planned?.isWarmup}
                    onRpe={(rpe) => row.logged && onRpe(row.logged, rpe)}
                    onUncheck={() => row.logged && !isInFlight(row.logged) && onUncheck(row.logged)}
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
                initialRpe={null}
                asksRpe={asksRpe}
                onCancel={() => setEditing(null)}
                onSave={(values, note, rpe) => onSave({ setNumber: Number(extraKey.split(':')[1]) }, values, note, rpe)}
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
        </>
      )}
      <NoteBar name={item.exercise.name} notes={notes} onNote={onNote} />
    </article>
  )
}

/** "Oct 13" */
function formatShort(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
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
function LadderStep({ ladder, history, onAdvanced }: { ladder: Ladder; history: PastSession[]; onAdvanced: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const main = ladder.steps.filter((s) => !s.is_bonus)
  const current = ladder.steps.find((s) => !s.achieved_on)
  if (!current) return <p className="mt-3 rounded-xl bg-emerald-500/10 p-3 text-sm">Every step of {ladder.name} is done.</p>
  const next = ladder.steps.find((s) => s.step_number > current.step_number)
  // Sessions on this step only: after the previous step was hit.
  const since = ladder.steps.filter((s) => s.achieved_on && s.step_number < current.step_number).at(-1)?.achieved_on ?? ''
  const ready = readyToMoveUp(history.filter((s) => s.date > since))

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
      {ready && (
        <p className="mt-2 rounded-lg bg-violet-600/10 p-2 text-sm font-medium">
          You've hit your targets 3 sessions in a row on this step. If today goes well too, tap “I hit this step”.
        </p>
      )}
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
  asksRpe,
  onRpe,
  onUncheck,
}: {
  row: Row
  number: string
  label: string
  isNext: boolean
  onTap: () => void
  onCheck: () => void
  asksRpe: boolean
  onRpe: (rpe: number) => void
  onUncheck: () => void
}) {
  const { planned, logged } = row
  const pending = logged && (isInFlight(logged) || isQueued(logged))
  const promptRpe = asksRpe && logged && logged.rpe === null && !isInFlight(logged)

  return (
    <>
    <div
      className={`flex items-center gap-3 rounded-xl px-3 py-2 ${isNext ? 'bg-emerald-500/10 ring-2 ring-emerald-500' : 'bg-neutral-100 dark:bg-neutral-800/60'}`}
    >
      <span className="w-7 shrink-0 text-sm text-neutral-500 tabular-nums">
        {number}
      </span>
      <button type="button" onClick={onTap} className="min-w-0 flex-1 py-1 text-left">
        {logged ? (
          <>
            <span className="block text-base font-medium">
              {describeLogged(logged)}
              {logged.rpe !== null && <span className="ml-1.5 text-sm font-normal text-neutral-500">RPE {Number(logged.rpe)}</span>}
            </span>
            {planned && <span className="block text-xs text-neutral-500">Target {label}</span>}
            {logged.note && <span className="block text-xs text-neutral-500 italic">{logged.note}</span>}
            {isQueued(logged) && <span className="block text-xs text-amber-600">Saved on this phone, sends when online</span>}
          </>
        ) : (
          <span className={`block text-base ${planned?.isWarmup ? 'text-neutral-500' : 'font-medium'}`}>{label}</span>
        )}
      </button>
      {logged ? (
        <button
          type="button"
          onClick={onUncheck}
          disabled={Boolean(logged && isInFlight(logged))}
          aria-label={`Uncheck: ${logged.hit_target === false ? 'logged, missed target' : 'logged'}`}
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl text-white ${pending ? 'bg-neutral-400' : logged.hit_target === false ? 'bg-amber-500' : 'bg-emerald-600'}`}
        >
          ✓
        </button>
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
    {promptRpe && (
      <div className="mt-1 px-1">
        <p className="text-xs text-neutral-500">How hard? RPE (10 = nothing left, 9 = 1 more rep, 8 = 2 more)</p>
        <RpeChips value={null} onPick={onRpe} />
      </div>
    )}
    </>
  )
}

function RpeChips({ value, onPick }: { value: number | null; onPick: (rpe: number) => void }) {
  return (
    <div className="mt-1 flex gap-1">
      {RPE_OPTIONS.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onPick(r)}
          aria-label={`RPE ${r}`}
          className={`h-10 min-w-0 flex-1 rounded-lg text-sm font-medium ${value === r ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-neutral-900'} border border-neutral-300 dark:border-neutral-700`}
        >
          {r}
        </button>
      ))}
    </div>
  )
}

/** Times for runs and timed blocks are typed as m:ss; holds stay in plain seconds. */
const usesClock = (measure: DayExercise['exercise']['measure'], f: SetField) =>
  f === 'seconds' && (measure === 'distance' || measure === 'duration')

const DISTANCE_PICKS = [
  { label: '400 m', m: 400 },
  { label: '1 km', m: 1000 },
  { label: '1 mi', m: 1609 },
  { label: '5 km', m: 5000 },
]

/**
 * Weight, reps, time or distance with big −/+ buttons, RPE and a note.
 * `active` makes it the current set, open on the card: one green button logs it.
 * Otherwise it edits a set you tapped, with Cancel (and Delete for a logged set).
 */
/** An open set on one line: a box per field, RPE and ✓. Tap the set number to open the full editor. */
function QuickRow({
  measure,
  number,
  target,
  initial,
  asksRpe,
  isNext,
  onExpand,
  onLog,
}: {
  measure: DayExercise['exercise']['measure']
  number: string
  target: string
  initial: SetValues
  asksRpe: boolean
  isNext: boolean
  onExpand: () => void
  onLog: (values: SetValues, rpe: number | null) => void
}) {
  const fields = MEASURE_FIELDS[measure]
  const [text, setText] = useState<Record<SetField, string>>(() => {
    const out = {} as Record<SetField, string>
    for (const f of fields) out[f] = showField(measure, f, initial[f])
    return out
  })
  const [rpe, setRpe] = useState('')
  function log() {
    const values: SetValues = {}
    for (const f of fields) {
      const v = readField(measure, f, text[f])
      if (v !== undefined) values[f] = v
    }
    onLog(values, rpe ? Number(rpe) : null)
  }
  return (
    <div className={`rounded-xl px-2 py-1.5 ${isNext ? 'bg-emerald-500/10 ring-2 ring-emerald-500' : 'bg-neutral-100 dark:bg-neutral-800/60'}`}>
      <button type="button" onClick={onExpand} className="block w-full text-left text-xs text-neutral-500">
        <span className="font-semibold text-neutral-700 dark:text-neutral-300">{number}</span> · target {target}
      </button>
      <div className="mt-1 flex items-end gap-1.5">
        {fields.map((f) => (
          <label key={f} className="flex min-w-0 flex-1 flex-col items-center">
            <input
              inputMode={usesClock(measure, f) ? 'text' : 'decimal'}
              value={text[f]}
              placeholder={usesClock(measure, f) ? 'm:ss' : ''}
              onChange={(e) => setText((t) => ({ ...t, [f]: e.target.value }))}
              aria-label={`Set ${number} ${usesClock(measure, f) ? 'time' : FIELD_LABELS[f]}`}
              className="h-11 w-full rounded-lg border border-neutral-300 bg-white text-center text-lg font-semibold tabular-nums dark:border-neutral-700 dark:bg-neutral-900"
            />
            <span className="text-[10px] text-neutral-500">{usesClock(measure, f) ? 'time' : FIELD_LABELS[f]}</span>
          </label>
        ))}
        {asksRpe && (
          <label className="flex w-16 shrink-0 flex-col items-center">
            <select
              value={rpe}
              onChange={(e) => setRpe(e.target.value)}
              aria-label={`Set ${number} RPE`}
              className="h-11 w-full rounded-lg border border-neutral-300 bg-white text-center text-base dark:border-neutral-700 dark:bg-neutral-900"
            >
              <option value="">–</option>
              {RPE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <span className="text-[10px] text-neutral-500">RPE</span>
          </label>
        )}
        <button
          type="button"
          onClick={log}
          aria-label={`Log set ${number}`}
          className="mb-3.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-emerald-600 text-xl text-emerald-600 active:bg-emerald-600 active:text-white"
        >
          ✓
        </button>
      </div>
    </div>
  )
}

const showField = (measure: DayExercise['exercise']['measure'], f: SetField, v: number | undefined) =>
  v === undefined ? '' : usesClock(measure, f) && v >= 60 ? formatDuration(v) : String(v)

function readField(measure: DayExercise['exercise']['measure'], f: SetField, t: string): number | undefined {
  if (t.trim() === '') return undefined
  const n = usesClock(measure, f) ? parseTime(t) : Number(t)
  return n !== null && Number.isFinite(n) ? n : undefined
}

function SetEditor({
  measure,
  initial,
  initialNote,
  initialRpe,
  asksRpe,
  onSave,
  onCancel,
  onDelete,
  onCollapse,
  active,
}: {
  measure: DayExercise['exercise']['measure']
  initial: SetValues
  initialNote: string
  initialRpe: number | null
  asksRpe: boolean
  onSave: (values: SetValues, note: string, rpe: number | null) => void
  onCancel?: () => void
  onDelete?: () => void
  /** Tapping the box's header closes it. */
  onCollapse?: () => void
  active?: { number: string; target: string; isNext: boolean }
}) {
  const fields = MEASURE_FIELDS[measure]
  const show = (f: SetField, v: number | undefined) =>
    v === undefined ? '' : usesClock(measure, f) && v >= 60 ? formatDuration(v) : String(v)
  const read = (f: SetField, t: string): number | undefined => {
    if (t.trim() === '') return undefined
    const n = usesClock(measure, f) ? parseTime(t) : Number(t)
    return n !== null && Number.isFinite(n) ? n : undefined
  }
  const [text, setText] = useState<Record<SetField, string>>(() => {
    const out = {} as Record<SetField, string>
    for (const f of fields) out[f] = show(f, initial[f])
    return out
  })
  const [note, setNote] = useState(initialNote)
  const [showNote, setShowNote] = useState(!active || Boolean(initialNote))
  const [rpe, setRpe] = useState<number | null>(initialRpe === null ? null : Number(initialRpe))
  const [paceText, setPaceText] = useState('')

  const bump = (f: SetField, by: number) =>
    setText((t) => ({ ...t, [f]: show(f, Math.max(0, (read(f, t[f]) ?? 0) + by)) }))

  const distance = read('distance_m', text.distance_m ?? '')
  const seconds = read('seconds', text.seconds ?? '')
  const pace = measure === 'distance' && distance && seconds ? pacePerMile(distance, seconds) : null

  function setPace(t: string) {
    setPaceText(t)
    const p = parseTime(t)
    if (p && distance) setText((x) => ({ ...x, seconds: show('seconds', timeFromPace(distance, p)) }))
  }

  function submit() {
    const values: SetValues = {}
    for (const f of fields) {
      const v = read(f, text[f])
      if (v !== undefined) values[f] = v
    }
    onSave(values, note.trim(), rpe)
  }

  return (
    <div
      className={`rounded-xl p-3 ${active ? `bg-emerald-500/10 ${active.isNext ? 'ring-2 ring-emerald-500' : ''}` : 'bg-neutral-100 dark:bg-neutral-800/60'}`}
    >
      {(active || onCollapse) && (
        <button type="button" onClick={onCollapse} className="mb-2 flex w-full items-center gap-1 text-left text-sm" aria-label="Close this set">
          {active ? (
            <>
              <span className="font-semibold">Set {active.number}</span>
              <span className="text-neutral-500"> · target {active.target}</span>
            </>
          ) : (
            <span className="text-neutral-500">Edit set</span>
          )}
          <span className="ml-auto text-neutral-400" aria-hidden>
            ▴
          </span>
        </button>
      )}
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
            inputMode={usesClock(measure, f) ? 'text' : 'decimal'}
            value={text[f]}
            placeholder={usesClock(measure, f) ? 'm:ss' : ''}
            onChange={(e) => setText((t) => ({ ...t, [f]: e.target.value }))}
            aria-label={usesClock(measure, f) ? 'time' : FIELD_LABELS[f]}
            className="h-12 min-w-0 flex-1 rounded-xl border border-neutral-300 bg-white text-center text-xl font-semibold tabular-nums dark:border-neutral-700 dark:bg-neutral-900"
          />
          <span className="w-16 shrink-0 text-sm text-neutral-500">{usesClock(measure, f) ? 'time' : FIELD_LABELS[f]}</span>
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
      {measure === 'distance' && (
        <div className="mb-2 space-y-2">
          <div className="flex gap-1">
            {DISTANCE_PICKS.map((d) => (
              <button
                key={d.label}
                type="button"
                onClick={() => setText((t) => ({ ...t, distance_m: String(d.m) }))}
                className="h-9 flex-1 rounded-lg border border-neutral-300 bg-white text-sm dark:border-neutral-700 dark:bg-neutral-900"
              >
                {d.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-neutral-500">Pace</span>
            <input
              value={paceText}
              onChange={(e) => setPace(e.target.value)}
              placeholder={pace ? formatDuration(pace) : 'm:ss'}
              aria-label="Pace per mile"
              className="h-10 w-24 rounded-lg border border-neutral-300 bg-white text-center tabular-nums dark:border-neutral-700 dark:bg-neutral-900"
            />
            <span className="text-neutral-500">/mi</span>
            {pace && <span className="ml-auto font-medium tabular-nums">{formatDuration(pace)}/mi · {formatDuration(pace / 1.609344)}/km</span>}
          </div>
        </div>
      )}
      {asksRpe && (
        <div className="mb-2">
          <p className="text-xs text-neutral-500">RPE (10 = nothing left, 9 = 1 more rep, 8 = 2 more)</p>
          <RpeChips value={rpe} onPick={(r) => setRpe(rpe === r ? null : r)} />
        </div>
      )}
      {showNote ? (
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          className="mb-3 h-11 w-full rounded-xl border border-neutral-300 bg-white px-3 dark:border-neutral-700 dark:bg-neutral-900"
        />
      ) : (
        <button type="button" onClick={() => setShowNote(true)} className="mb-2 text-sm text-neutral-500 underline">
          + Note
        </button>
      )}
      <div className="flex gap-2">
        {onDelete && (
          <button type="button" onClick={onDelete} className="h-12 rounded-xl px-3 text-sm text-red-600">
            Delete
          </button>
        )}
        {onCancel && (
          <button type="button" onClick={onCancel} className="h-12 flex-1 rounded-xl bg-white font-medium dark:bg-neutral-900">
            Cancel
          </button>
        )}
        <button type="button" onClick={submit} className="h-12 flex-[2] rounded-xl bg-emerald-600 text-lg font-semibold text-white">
          {active ? '✓ Log set' : 'Save'}
        </button>
      </div>
    </div>
  )
}

/** The one-off edit form for an exercise: scrolls into view and stands out, so it's clear it opened. */
function EditPanel({ name, onClose, children }: { name: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), [])
  return (
    <section
      ref={ref}
      aria-label={`Edit ${name}`}
      className="mb-3 scroll-mt-4 rounded-2xl border-2 border-emerald-500 bg-emerald-50 p-4 dark:bg-emerald-950/40"
    >
      <header className="mb-2 flex items-start gap-2">
        <div className="flex-1">
          <h3 className="font-semibold">Editing {name}</h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-300">For this day only. To change it every week, use Plan.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close the edit form" className="-m-2 p-2 text-xl leading-none text-neutral-500">
          ×
        </button>
      </header>
      {children}
    </section>
  )
}

/** This exercise's lines from the day's notes ("Exercise: note"), newest last. */
function notesFor(dayNotes: string | null, name: string): string[] {
  const prefix = `${name}: `
  return (dayNotes ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.startsWith(prefix))
    .map((p) => p.slice(prefix.length))
}

/** A note box on every card: type a note for Claude and save it without opening Edit. */
function NoteBar({ name, notes, onNote }: { name: string; notes: string[]; onNote: (text: string) => Promise<void> }) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  async function save() {
    const t = text.trim()
    if (!t || saving) return
    setSaving(true)
    try {
      await onNote(t)
      setText('')
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="mt-3">
      {notes.map((n, i) => (
        <p key={i} className="mb-1 rounded-lg bg-amber-500/10 px-3 py-1.5 text-sm">
          <span className="text-neutral-500">Your note: </span>
          {n}
        </p>
      ))}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Note for Claude…"
          aria-label={`Note about ${name}`}
          enterKeyHint="send"
          className="h-10 min-w-0 flex-1 rounded-lg border border-neutral-200 bg-transparent px-3 text-sm dark:border-neutral-700"
        />
        {text.trim() && (
          <button type="submit" disabled={saving} className="h-10 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white disabled:opacity-60">
            Save
          </button>
        )}
      </form>
    </div>
  )
}
