import { useEffect, useState } from 'react'
import { Thumb, UploadButton, Viewer } from '../components/MediaGallery'
import { check, listExercises } from '../lib/api'
import { formatMonth } from '../lib/dates'
import { deleteMedia, listMedia, signedUrls, uploadMedia, type MediaTags } from '../lib/media'
import { supabase } from '../lib/supabase'
import type { Exercise, Feat, Media } from '../lib/types'

const select = 'h-11 min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-2 dark:border-neutral-700 dark:bg-neutral-900'

/** Every photo and clip, newest first, filterable, with a side-by-side compare. */
export function MediaScreen() {
  const [feats, setFeats] = useState<Feat[]>([])
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [filter, setFilter] = useState<MediaTags>({})
  const [items, setItems] = useState<Media[]>([])
  const [urls, setUrls] = useState<Map<string, string>>(new Map())
  const [open, setOpen] = useState<Media | null>(null)
  const [comparing, setComparing] = useState(false)
  const [picked, setPicked] = useState<Media[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!supabase) return
    const db = supabase
    Promise.all([db.from('feats').select('*').order('position'), listExercises(db)]).then(
      ([f, e]) => {
        setFeats(check<Feat[]>(f))
        setExercises(e)
      },
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    )
  }, [])

  useEffect(() => {
    if (!supabase) return
    const db = supabase
    let cancelled = false
    listMedia(db, filter)
      .then(async (list) => {
        const u = await signedUrls(db, list.map((m) => m.storage_path))
        if (!cancelled) {
          setItems(list)
          setUrls(u)
        }
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
    }
  }, [filter, version])

  async function upload(files: FileList | null) {
    if (!supabase || !files?.length) return
    setBusy(true)
    try {
      for (const f of Array.from(files)) await uploadMedia(supabase, f, filter)
      setVersion((v) => v + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  async function remove(m: Media) {
    if (!supabase || !window.confirm('Delete this photo or clip for good?')) return
    try {
      await deleteMedia(supabase, m)
      setOpen(null)
      setVersion((v) => v + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function tap(m: Media) {
    if (!comparing) return setOpen(m)
    setPicked((p) => (p.some((x) => x.id === m.id) ? p.filter((x) => x.id !== m.id) : [...p, m].slice(-2)))
  }

  const byMonth = new Map<string, Media[]>()
  for (const m of items) byMonth.set(m.taken_on.slice(0, 7), [...(byMonth.get(m.taken_on.slice(0, 7)) ?? []), m])

  return (
    <section>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Media</h1>
        <UploadButton busy={busy} onFiles={(f) => void upload(f)} />
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-3 flex gap-2">
        <select
          className={select}
          value={filter.feat_id ?? ''}
          onChange={(e) => setFilter({ feat_id: e.target.value || undefined })}
          aria-label="Filter by feat"
        >
          <option value="">All feats</option>
          {feats.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <select
          className={select}
          value={filter.exercise_id ?? ''}
          onChange={(e) => setFilter({ exercise_id: e.target.value || undefined })}
          aria-label="Filter by exercise"
        >
          <option value="">All exercises</option>
          {exercises.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        onClick={() => {
          setComparing(!comparing)
          setPicked([])
        }}
        className="mt-2 text-sm underline"
      >
        {comparing ? 'Done comparing' : 'Compare two side by side'}
      </button>
      {comparing && <p className="text-sm text-neutral-500">Tap two photos or clips.</p>}

      {picked.length === 2 && (
        <div className="mt-3 grid grid-cols-2 gap-1">
          {picked
            .slice()
            .sort((a, b) => a.taken_on.localeCompare(b.taken_on))
            .map((m) => (
              <figure key={m.id}>
                {m.kind === 'video' ? (
                  <video src={urls.get(m.storage_path)} controls playsInline className="w-full rounded-lg" />
                ) : (
                  <img src={urls.get(m.storage_path)} alt="" className="w-full rounded-lg" />
                )}
                <figcaption className="text-center text-xs text-neutral-500">{m.taken_on}</figcaption>
              </figure>
            ))}
        </div>
      )}

      {items.length === 0 && <p className="mt-6 text-neutral-500">No photos or clips yet.</p>}
      {[...byMonth].map(([month, list]) => (
        <div key={month} className="mt-5">
          <h2 className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">{formatMonth(month)}</h2>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {list.map((m) => (
              <Thumb key={m.id} media={m} url={urls.get(m.storage_path)} onClick={() => tap(m)} selected={picked.some((p) => p.id === m.id)} />
            ))}
          </div>
        </div>
      ))}
      {open && <Viewer media={open} url={urls.get(open.storage_path)} onClose={() => setOpen(null)} onDelete={() => void remove(open)} />}
    </section>
  )
}
