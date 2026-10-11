import { useCallback, useEffect, useRef, useState } from 'react'
import { deleteMedia, listMedia, signedUrls, uploadMedia, type MediaTags } from '../lib/media'
import { supabase } from '../lib/supabase'
import type { Media } from '../lib/types'

/** Thumbnail grid for a set of media, with upload and a full-screen viewer. */
export function MediaGallery({
  filter,
  uploadTags = filter,
  title = 'Photos and clips',
  takenOn,
}: {
  filter: MediaTags
  uploadTags?: MediaTags
  title?: string
  takenOn?: string
}) {
  const [items, setItems] = useState<Media[]>([])
  const [urls, setUrls] = useState<Map<string, string>>(new Map())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Media | null>(null)
  const key = JSON.stringify(filter)

  const load = useCallback(async () => {
    if (!supabase) return
    try {
      const list = await listMedia(supabase, JSON.parse(key) as MediaTags)
      setItems(list)
      setUrls(await signedUrls(supabase, list.map((m) => m.storage_path)))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [key])

  useEffect(() => {
    let cancelled = false
    if (!supabase) return
    const db = supabase
    listMedia(db, JSON.parse(key) as MediaTags)
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
  }, [key])

  async function upload(files: FileList | null) {
    if (!supabase || !files?.length) return
    setBusy(true)
    setError(null)
    try {
      for (const file of Array.from(files)) await uploadMedia(supabase, file, uploadTags, { takenOn })
      await load()
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
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <UploadButton busy={busy} onFiles={(f) => void upload(f)} />
      </div>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      {items.length > 0 ? (
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {items.map((m) => (
            <Thumb key={m.id} media={m} url={urls.get(m.storage_path)} onClick={() => setOpen(m)} />
          ))}
        </div>
      ) : (
        <p className="mt-1 text-sm text-neutral-500">None yet.</p>
      )}
      {open && <Viewer media={open} url={urls.get(open.storage_path)} onClose={() => setOpen(null)} onDelete={() => void remove(open)} />}
    </div>
  )
}

export function UploadButton({ busy, onFiles, label = '+ Add' }: { busy: boolean; onFiles: (f: FileList | null) => void; label?: string }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => ref.current?.click()}
        className="rounded-lg bg-neutral-100 px-3 py-2 text-sm font-medium disabled:opacity-50 dark:bg-neutral-800"
      >
        {busy ? 'Uploading…' : label}
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          onFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </>
  )
}

export function Thumb({ media, url, onClick, selected }: { media: Media; url?: string; onClick: () => void; selected?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative aspect-square overflow-hidden rounded-lg bg-neutral-200 dark:bg-neutral-800 ${selected ? 'ring-4 ring-emerald-500' : ''}`}
    >
      {url &&
        (media.kind === 'video' ? (
          <video src={`${url}#t=0.1`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
        ) : (
          <img src={url} alt={media.caption ?? ''} loading="lazy" className="h-full w-full object-cover" />
        ))}
      {media.kind === 'video' && <span className="absolute right-1 bottom-1 rounded bg-black/60 px-1 text-xs text-white">▶</span>}
    </button>
  )
}

export function Viewer({ media, url, onClose, onDelete }: { media: Media; url?: string; onClose: () => void; onDelete?: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black" role="dialog">
      <div className="flex items-center justify-between p-3 text-white" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <span className="text-sm">{media.taken_on}</span>
        <div className="flex gap-4">
          {onDelete && (
            <button type="button" onClick={onDelete} className="text-sm text-red-400">
              Delete
            </button>
          )}
          <button type="button" onClick={onClose} className="text-lg">
            Close
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        {url &&
          (media.kind === 'video' ? (
            <video src={url} controls playsInline autoPlay className="max-h-full max-w-full" />
          ) : (
            <img src={url} alt={media.caption ?? ''} className="max-h-full max-w-full object-contain" />
          ))}
      </div>
      {media.caption && <p className="p-3 text-sm text-white">{media.caption}</p>}
    </div>
  )
}
