import { useState } from 'react'
import { useNavigate } from 'react-router'
import { addSessionExercise, listExercises, moveSession, updateSessionNotes, type DayExercise, type DaySession } from '../lib/api'
import { supabase } from '../lib/supabase'
import type { Block, Exercise } from '../lib/types'
import { MediaGallery } from './MediaGallery'
import { PrescriptionForm } from './PrescriptionForm'

const BLOCKS: Block[] = ['warmup', 'skill', 'power', 'strength', 'conditioning', 'accessory', 'mobility']
const field = 'h-11 w-full rounded-lg border border-neutral-300 bg-white px-3 dark:border-neutral-700 dark:bg-neutral-900'

/** Notes, photos, moving the day and adding an exercise. Every edit is one-off for this session. */
export function SessionOptions({
  session,
  items,
  onChanged,
  onError,
}: {
  session: DaySession
  items: DayExercise[]
  onChanged: () => void
  onError: (message: string) => void
}) {
  const db = supabase!
  const navigate = useNavigate()
  const [notes, setNotes] = useState(session.notes ?? '')
  const [moveTo, setMoveTo] = useState(session.date)
  const [library, setLibrary] = useState<Exercise[] | null>(null)
  const [adding, setAdding] = useState<{ exerciseId: string; block: Block } | null>(null)
  const report = (e: unknown) => onError(e instanceof Error ? e.message : String(e))

  async function saveNotes() {
    try {
      await updateSessionNotes(db, session.id, notes.trim())
      onChanged()
    } catch (e) {
      report(e)
    }
  }

  async function move() {
    if (moveTo === session.date) return
    try {
      await moveSession(db, session, moveTo)
      navigate(`/day/${moveTo}`)
    } catch (e) {
      report(e)
    }
  }

  async function startAdding() {
    try {
      const list = library ?? (await listExercises(db))
      setLibrary(list)
      setAdding({ exerciseId: list[0]?.id ?? '', block: 'accessory' })
    } catch (e) {
      report(e)
    }
  }

  async function add(prescription: DayExercise['prescription']) {
    const exercise = library?.find((e) => e.id === adding?.exerciseId)
    if (!exercise || !adding) return
    try {
      const position = Math.max(0, ...items.map((i) => i.position)) + 1
      await addSessionExercise(db, session, exercise, adding.block, prescription, position)
      setAdding(null)
      onChanged()
    } catch (e) {
      report(e)
    }
  }

  const hasSets = session.status !== 'planned'

  return (
    <details className="mt-6 rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
      <summary className="cursor-pointer font-medium">Notes, photos and changes</summary>
      <div className="mt-4 space-y-6">
        <div>
          <label className="block text-sm font-semibold" htmlFor={`notes-${session.id}`}>
            Session notes
          </label>
          <textarea
            id={`notes-${session.id}`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-neutral-300 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900"
          />
          {notes !== (session.notes ?? '') && (
            <button type="button" onClick={() => void saveNotes()} className="mt-1 rounded-lg bg-emerald-600 px-4 py-2 text-white">
              Save notes
            </button>
          )}
        </div>

        <MediaGallery filter={{ session_id: session.id }} takenOn={session.date} />

        <div>
          <h3 className="text-sm font-semibold">Add an exercise to this day</h3>
          {!adding ? (
            <button type="button" onClick={() => void startAdding()} className="mt-1 text-sm underline">
              Choose an exercise
            </button>
          ) : (
            <div className="mt-2 space-y-2">
              <select
                className={field}
                value={adding.exerciseId}
                onChange={(e) => setAdding({ ...adding, exerciseId: e.target.value })}
              >
                {library?.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
              <select className={field} value={adding.block} onChange={(e) => setAdding({ ...adding, block: e.target.value as Block })}>
                {BLOCKS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
              <PrescriptionForm
                initial={{ sets: 3, reps: 10 }}
                saveLabel="Add"
                onCancel={() => setAdding(null)}
                onSave={(p) => void add(p)}
              />
            </div>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold">Move this session</h3>
          {hasSets ? (
            <p className="mt-1 text-sm text-neutral-500">Started sessions stay on the day they were done.</p>
          ) : (
            <div className="mt-1 flex gap-2">
              <input type="date" value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className={field} />
              <button
                type="button"
                onClick={() => void move()}
                disabled={moveTo === session.date}
                className="rounded-lg bg-neutral-900 px-4 text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
              >
                Move
              </button>
            </div>
          )}
        </div>
      </div>
    </details>
  )
}
