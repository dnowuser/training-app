import type { SupabaseClient } from '@supabase/supabase-js'
import { check, logChange } from './api'
import type { Area, Change, Cycle, Exercise, Measure, TemplateItem, TemplateSlot } from './types'

export type PlanItem = TemplateItem & { exercise: Exercise }
export type PlanSlot = TemplateSlot & { items: PlanItem[] }

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export async function loadTemplate(db: SupabaseClient): Promise<PlanSlot[]> {
  const slots = check<PlanSlot[]>(
    await db.from('template_slots').select('*, items:template_items(*, exercise:exercises(*))').order('weekday'),
  )
  return slots.map((s) => ({ ...s, items: [...s.items].sort((a, b) => a.position - b.position) }))
}

/** Last date with a generated session, so regeneration covers everything already planned. */
export async function generatedUntil(db: SupabaseClient): Promise<string | null> {
  const rows = check<{ date: string }[]>(
    await db.from('sessions').select('date').not('slot_id', 'is', null).order('date', { ascending: false }).limit(1),
  )
  return rows[0]?.date ?? null
}

/**
 * After any template edit: rebuild planned days from `from` to the end of what's
 * generated (days with logged sets, started or customized are kept), then log it.
 */
export async function applyTemplateChange(
  db: SupabaseClient,
  from: string,
  change: { summary: string; reason?: string; details?: Record<string, unknown> },
): Promise<number> {
  const until = await generatedUntil(db)
  let rebuilt = 0
  if (until && until >= from) {
    rebuilt = check<number>(await db.rpc('regenerate_sessions', { p_from: from, p_to: until }))
  }
  await logChange(db, { ...change, affects_from: from, details: { ...change.details, regenerated_until: until } })
  return rebuilt
}

export async function updateItem(
  db: SupabaseClient,
  id: string,
  patch: Partial<Pick<TemplateItem, 'prescription' | 'notes' | 'block' | 'position' | 'min_week' | 'max_week' | 'week_parity'>>,
): Promise<void> {
  check(await db.from('template_items').update(patch).eq('id', id))
}

export async function addItem(
  db: SupabaseClient,
  item: Pick<TemplateItem, 'slot_id' | 'exercise_id' | 'block' | 'prescription' | 'position'> & { notes?: string | null },
): Promise<void> {
  check(await db.from('template_items').insert(item))
}

export async function deleteItem(db: SupabaseClient, id: string): Promise<void> {
  check(await db.from('template_items').delete().eq('id', id))
}

export async function updateSlot(
  db: SupabaseClient,
  id: string,
  patch: Partial<Pick<TemplateSlot, 'name' | 'day_type' | 'mobility' | 'notes'>>,
): Promise<void> {
  check(await db.from('template_slots').update(patch).eq('id', id))
}

/** "Hip airplane (assisted)" -> "hip-airplane-assisted" */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export async function createExercise(
  db: SupabaseClient,
  e: { name: string; area: Area; measure: Measure; cues?: string },
): Promise<Exercise> {
  return check<Exercise>(
    await db
      .from('exercises')
      .insert({ slug: slugify(e.name), name: e.name, area: e.area, measure: e.measure, cues: e.cues || null })
      .select()
      .single(),
  )
}

export async function updateExerciseCues(db: SupabaseClient, id: string, cues: string): Promise<void> {
  check(await db.from('exercises').update({ cues: cues || null }).eq('id', id))
}

export async function loadActiveCycle(db: SupabaseClient): Promise<Cycle | null> {
  const rows = check<Cycle[]>(
    await db.from('cycles').select('*').eq('status', 'active').order('start_date', { ascending: false }).limit(1),
  )
  return rows[0] ?? null
}

export async function generateSessions(db: SupabaseClient, from: string, to: string): Promise<number> {
  return check<number>(await db.rpc('generate_sessions', { p_from: from, p_to: to }))
}

export async function startCycle(db: SupabaseClient, name: string, start: string, weeks: number): Promise<void> {
  check(await db.rpc('start_cycle', { p_name: name, p_start: start, p_weeks: weeks }))
}

export async function loadChanges(db: SupabaseClient, limit = 100): Promise<Change[]> {
  return check<Change[]>(await db.from('changes').select('*').order('created_at', { ascending: false }).limit(limit))
}

/** Week of the cycle a date falls in (1-based), or null outside it. */
export function cycleWeek(cycle: Pick<Cycle, 'start_date' | 'weeks'>, date: string): number | null {
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${cycle.start_date}T00:00:00Z`)) / 864e5)
  if (days < 0) return null
  const week = Math.floor(days / 7) + 1
  return week <= cycle.weeks ? week : null
}
