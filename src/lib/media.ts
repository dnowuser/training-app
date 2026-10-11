import type { SupabaseClient } from '@supabase/supabase-js'
import { check } from './api'
import { localISODate } from './dates'
import type { Media } from './types'

export interface MediaTags {
  session_id?: string | null
  exercise_id?: string | null
  feat_id?: string | null
  milestone_id?: string | null
}

/** Upload a photo or clip to the private bucket at <user_id>/<date>-<uuid>.<ext> and record it. */
export async function uploadMedia(
  db: SupabaseClient,
  file: File,
  tags: MediaTags,
  options: { caption?: string; takenOn?: string } = {},
): Promise<Media> {
  const userId = (await db.auth.getSession()).data.session?.user.id
  if (!userId) throw new Error('Not signed in')
  const kind = file.type.startsWith('video') ? 'video' : 'photo'
  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : kind === 'video' ? 'mp4' : 'jpg'
  const takenOn = options.takenOn ?? localISODate(new Date(file.lastModified || Date.now()))
  const path = `${userId}/${takenOn}-${crypto.randomUUID()}.${ext}`

  const { error } = await db.storage.from('media').upload(path, file, { contentType: file.type || undefined })
  if (error) throw new Error(error.message)

  const { data, error: insertError } = await db
    .from('media')
    .insert({ storage_path: path, kind, taken_on: takenOn, caption: options.caption || null, ...tags })
    .select()
    .single()
  if (insertError) {
    // Don't leave an orphan file behind if the row couldn't be written.
    await db.storage.from('media').remove([path])
    throw new Error(insertError.message)
  }
  return data as Media
}

/** Signed URLs (valid for an hour) for showing private media. */
export async function signedUrls(db: SupabaseClient, paths: string[]): Promise<Map<string, string>> {
  if (!paths.length) return new Map()
  const { data, error } = await db.storage.from('media').createSignedUrls(paths, 3600)
  if (error) throw new Error(error.message)
  return new Map((data ?? []).flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as const] : [])))
}

export async function listMedia(db: SupabaseClient, filter: MediaTags = {}): Promise<Media[]> {
  let q = db.from('media').select('*').order('taken_on', { ascending: false }).order('created_at', { ascending: false })
  for (const [key, value] of Object.entries(filter)) if (value) q = q.eq(key, value)
  return check<Media[]>(await q)
}

/** Removes the file and its row. Callers confirm first. */
export async function deleteMedia(db: SupabaseClient, media: Media): Promise<void> {
  const { error } = await db.storage.from('media').remove([media.storage_path])
  if (error) throw new Error(error.message)
  check(await db.from('media').delete().eq('id', media.id))
}
