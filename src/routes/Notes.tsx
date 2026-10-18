import { useEffect, useState } from 'react'
import { formatDay, localISODate } from '../lib/dates'
import { isDone, loadNotes, setNoteDone, type Note } from '../lib/notes'
import { supabase } from '../lib/supabase'

/** Every note you've written, open ones first; mark one done with what was done about it. */
export function NotesScreen() {
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [show, setShow] = useState<'open' | 'done'>('open')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    loadNotes(supabase).then(setNotes, (e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  const replace = (note: Note, status: Note['status']) =>
    setNotes((list) => list && list.map((n) => (n.source === note.source && n.sourceId === note.sourceId ? { ...n, status } : n)))

  async function mark(note: Note, done: boolean, response: string | null) {
    if (!supabase) return
    try {
      replace(note, await setNoteDone(supabase, note, done ? localISODate() : null, response))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const open = (notes ?? []).filter((n) => !isDone(n))
  const done = (notes ?? []).filter(isDone)
  const shown = show === 'open' ? open : done

  return (
    <section>
      <h1 className="text-2xl font-semibold">Notes</h1>
      <p className="mt-1 text-sm text-neutral-500">Everything you've written on sets and sessions. Mark one done once it's handled.</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {(['open', 'done'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setShow(k)}
            className={`h-11 rounded-xl text-sm font-medium ${
              show === k ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900' : 'border border-neutral-300 dark:border-neutral-700'
            }`}
          >
            {k === 'open' ? `Open (${open.length})` : `Done (${done.length})`}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {!notes && !error && <p className="mt-4 text-neutral-500">Loading…</p>}
      {notes && !shown.length && (
        <p className="mt-4 text-neutral-500">{show === 'open' ? 'Nothing open.' : 'Nothing marked done yet.'}</p>
      )}
      <ul className="mt-4 space-y-3">
        {shown.map((n) => (
          <NoteCard key={`${n.source}:${n.sourceId}`} note={n} onMark={(d, r) => void mark(n, d, r)} />
        ))}
      </ul>
    </section>
  )
}

function NoteCard({ note, onMark }: { note: Note; onMark: (done: boolean, response: string | null) => void }) {
  const [writing, setWriting] = useState(false)
  const [response, setResponse] = useState(note.status?.response ?? '')
  const done = isDone(note)
  return (
    <li className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="text-xs text-neutral-500">
        {formatDay(note.date)} · {note.where}
      </p>
      <p className="mt-1 whitespace-pre-line">{note.text}</p>
      {done && (
        <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">
          ✓ Done {formatDay(note.status!.done_on!)}
          {note.status?.response && <span className="block text-neutral-600 dark:text-neutral-300">{note.status.response}</span>}
        </p>
      )}
      {writing ? (
        <div className="mt-3">
          <textarea
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            rows={2}
            placeholder="What was done (optional)"
            className="w-full rounded-xl border border-neutral-300 bg-white p-3 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                onMark(true, response)
                setWriting(false)
              }}
              className="h-11 flex-1 rounded-xl bg-emerald-600 font-medium text-white"
            >
              ✓ Mark done
            </button>
            <button type="button" onClick={() => setWriting(false)} className="h-11 rounded-xl border border-neutral-300 px-4 dark:border-neutral-700">
              Cancel
            </button>
          </div>
        </div>
      ) : done ? (
        <button type="button" onClick={() => onMark(false, note.status?.response ?? null)} className="mt-3 text-sm text-neutral-500 underline">
          Open again
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setWriting(true)}
          className="mt-3 h-11 w-full rounded-xl border border-emerald-600 font-medium text-emerald-700 dark:text-emerald-400"
        >
          Mark done
        </button>
      )}
    </li>
  )
}
