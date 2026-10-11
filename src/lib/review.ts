import type { SupabaseClient } from '@supabase/supabase-js'
import { check } from './api'
import { loadCalendar, summarize, type CalendarDay } from './calendar'
import { addDays, formatDay } from './dates'

export interface ReviewSet {
  date: string
  exercise: string
  exercise_slug: string
  set_number: number
  is_warmup: boolean | null
  reps: number | null
  load_lb: number | null
  seconds: number | null
  distance_m: number | null
  contacts: number | null
  hit_target: boolean | null
  set_note: string | null
}

export interface WeekReview {
  start: string
  end: string
  days: CalendarDay[]
  sets: ReviewSet[]
  notes: { date: string; text: string }[]
}

export async function loadWeek(db: SupabaseClient, start: string, today: string): Promise<WeekReview> {
  const end = addDays(start, 6)
  const [rows, sets, notes] = await Promise.all([
    loadCalendar(db, start, end),
    db
      .from('session_log')
      .select('date, exercise, exercise_slug, set_number, is_warmup, reps, load_lb, seconds, distance_m, contacts, hit_target, set_note')
      .not('set_id', 'is', null)
      .gte('date', start)
      .lte('date', end)
      .order('date')
      .order('position')
      .order('set_number'),
    db.from('sessions').select('date, notes').gte('date', start).lte('date', end).not('notes', 'is', null),
  ])
  return {
    start,
    end,
    days: rows.map((r) => summarize(r, today)),
    sets: check<ReviewSet[]>(sets),
    notes: check<{ date: string; notes: string }[]>(notes).map((n) => ({ date: n.date, text: n.notes })),
  }
}

export function describeSet(s: Pick<ReviewSet, 'reps' | 'load_lb' | 'seconds' | 'distance_m' | 'contacts'>): string {
  return (
    [
      s.load_lb !== null ? `${Number(s.load_lb)} lb` : '',
      s.reps !== null ? `× ${s.reps}` : '',
      s.distance_m !== null ? `${Number(s.distance_m)} m` : '',
      s.seconds !== null ? `${Number(s.seconds)} s` : '',
      s.contacts !== null ? `${s.contacts} contacts` : '',
    ]
      .filter(Boolean)
      .join(' ') || 'done'
  )
}

/** Plain-text summary of the week, to paste into a chat with Claude. */
export function weekSummary(w: WeekReview): string {
  const lines = [`Training week ${formatDay(w.start)} to ${formatDay(w.end)}`, '']
  for (const d of w.days) {
    lines.push(`- ${formatDay(d.date)}: ${d.name}: ${d.state}, ${d.logged}/${d.planned} sets${d.isDeload ? ' (deload)' : ''}`)
  }
  const misses = w.sets.filter((s) => s.hit_target === false)
  if (misses.length) {
    lines.push('', 'Missed targets:')
    for (const s of misses) lines.push(`- ${formatDay(s.date)} ${s.exercise} set ${s.set_number}: ${describeSet(s)}`)
  }
  const notes = [
    ...w.sets.filter((s) => s.set_note).map((s) => `- ${formatDay(s.date)} ${s.exercise}: ${s.set_note}`),
    ...w.notes.map((n) => `- ${formatDay(n.date)} session: ${n.text}`),
  ]
  if (notes.length) lines.push('', 'Notes:', ...notes)
  return lines.join('\n')
}
