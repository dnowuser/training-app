import type { SupabaseClient } from '@supabase/supabase-js'
import { check } from './api'
import { localISODate } from './dates'

export interface SearchResult {
  kind: 'day' | 'set' | 'session' | 'feat' | 'milestone' | 'media' | 'change' | 'exercise'
  title: string
  detail: string
  date?: string
  to: string
}

/** Strip characters that would break a PostgREST or() filter. */
export function cleanQuery(q: string): string {
  return q.replace(/[,()*%\\]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** "2026-10-12", "10/12" or "10/12/2026" -> YYYY-MM-DD. */
export function parseDateQuery(q: string, today = localISODate()): string | null {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(q.trim())
  const us = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(q.trim())
  let y: number, m: number, d: number
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
  else if (us) {
    ;[m, d] = [Number(us[1]), Number(us[2])]
    y = us[3] ? Number(us[3].length === 2 ? `20${us[3]}` : us[3]) : Number(today.slice(0, 4))
  } else return null
  const date = new Date(y, m - 1, d)
  if (date.getMonth() !== m - 1 || date.getDate() !== d) return null
  return localISODate(date)
}

/** Search logs, notes, feats, milestones, media captions, the change log and exercises. */
export async function search(db: SupabaseClient, raw: string): Promise<SearchResult[]> {
  const results: SearchResult[] = []
  const date = parseDateQuery(raw)
  if (date) results.push({ kind: 'day', title: `Open ${date}`, detail: 'Go to that day', date, to: `/day/${date}` })

  const q = cleanQuery(raw)
  if (q.length < 2) return results
  const like = `%${q}%`
  const pat = `*${q}*`

  const [sets, sessions, feats, milestones, media, changes] = await Promise.all([
    db
      .from('session_log')
      .select('date, session, exercise, exercise_slug, set_number, reps, load_lb, seconds, distance_m, set_note')
      .not('set_id', 'is', null)
      .or(`exercise.ilike.${pat},set_note.ilike.${pat}`)
      .order('date', { ascending: false })
      .limit(40),
    db.from('sessions').select('date, name, notes').or(`name.ilike.${pat},notes.ilike.${pat}`).order('date', { ascending: false }).limit(20),
    db.from('feats').select('slug, name, target, stage').or(`name.ilike.${pat},target.ilike.${pat},notes.ilike.${pat}`).limit(20),
    db.from('milestones').select('title, note, achieved_on').or(`title.ilike.${pat},note.ilike.${pat}`).order('achieved_on', { ascending: false }).limit(20),
    db.from('media').select('caption, taken_on').ilike('caption', like).order('taken_on', { ascending: false }).limit(20),
    db.from('changes').select('summary, reason, created_at').or(`summary.ilike.${pat},reason.ilike.${pat}`).order('created_at', { ascending: false }).limit(20),
  ])

  for (const f of check<{ slug: string; name: string; target: string | null; stage: string }[]>(feats)) {
    results.push({ kind: 'feat', title: f.name, detail: `${f.stage} · ${f.target ?? ''}`, to: `/feats/${f.slug}` })
  }
  for (const m of check<{ title: string; note: string | null; achieved_on: string }[]>(milestones)) {
    results.push({ kind: 'milestone', title: m.title, detail: m.note ?? 'Milestone', date: m.achieved_on, to: `/day/${m.achieved_on}` })
  }
  for (const s of check<
    {
      date: string
      session: string
      exercise: string
      set_number: number
      reps: number | null
      load_lb: number | null
      seconds: number | null
      distance_m: number | null
      set_note: string | null
    }[]
  >(sets)) {
    const what = [
      s.load_lb !== null ? `${s.load_lb} lb` : '',
      s.reps !== null ? `× ${s.reps}` : '',
      s.distance_m !== null ? `${s.distance_m} m` : '',
      s.seconds !== null ? `${s.seconds} s` : '',
    ]
      .filter(Boolean)
      .join(' ')
    results.push({
      kind: 'set',
      title: `${s.exercise}, set ${s.set_number}${what ? `: ${what}` : ''}`,
      detail: s.set_note ? `“${s.set_note}”` : s.session,
      date: s.date,
      to: `/day/${s.date}`,
    })
  }
  for (const s of check<{ date: string; name: string; notes: string | null }[]>(sessions)) {
    if (!s.notes?.toLowerCase().includes(q.toLowerCase()) && !s.name.toLowerCase().includes(q.toLowerCase())) continue
    results.push({ kind: 'session', title: s.name, detail: s.notes ?? 'Session', date: s.date, to: `/day/${s.date}` })
  }
  for (const m of check<{ caption: string | null; taken_on: string }[]>(media)) {
    results.push({ kind: 'media', title: m.caption ?? 'Photo or clip', detail: 'Media', date: m.taken_on, to: '/media' })
  }
  for (const c of check<{ summary: string; reason: string | null; created_at: string }[]>(changes)) {
    results.push({ kind: 'change', title: c.summary, detail: c.reason ?? 'Change log', date: c.created_at.slice(0, 10), to: '/plan?tab=changes' })
  }
  return results
}
