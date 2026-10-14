import type { SupabaseClient } from '@supabase/supabase-js'
import { check } from './api'

/** Every table with your data, in an order that can be re-imported (parents first). */
export const EXPORT_TABLES = [
  'exercises',
  'feats',
  'feat_steps',
  'cycles',
  'template_slots',
  'template_items',
  'sessions',
  'session_exercises',
  'sets',
  'milestones',
  'media',
  'metrics',
  'changes',
  'trash',
] as const

/** All rows of every table (paged, so nothing is cut off at the API's row limit). */
export async function exportAll(db: SupabaseClient): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {}
  for (const table of EXPORT_TABLES) {
    const rows: unknown[] = []
    for (let from = 0; ; from += 1000) {
      const page = check<unknown[]>(await db.from(table).select('*').range(from, from + 999))
      rows.push(...page)
      if (page.length < 1000) break
    }
    out[table] = rows
  }
  return out
}

/** CSV with a header row; values quoted when they contain commas, quotes or newlines. */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return ''
  const cols = Object.keys(rows[0])
  const cell = (v: unknown) => {
    if (v === null || v === undefined) return ''
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n')
}

/** Every logged set with its date, session and exercise: the spreadsheet-friendly log. */
export async function exportLogCsv(db: SupabaseClient): Promise<string> {
  const rows: Record<string, unknown>[] = []
  for (let from = 0; ; from += 1000) {
    const page = check<Record<string, unknown>[]>(
      await db
        .from('session_log')
        .select('date, session, exercise, block, set_number, is_warmup, reps, load_lb, seconds, distance_m, contacts, rpe, hit_target, set_note')
        .not('set_id', 'is', null)
        .order('date')
        .order('position')
        .order('set_number')
        .range(from, from + 999),
    )
    rows.push(...page)
    if (page.length < 1000) break
  }
  return toCsv(rows)
}

export function download(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
