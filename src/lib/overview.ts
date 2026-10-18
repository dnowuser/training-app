import type { SupabaseClient } from '@supabase/supabase-js'
import { check } from './api'
import { isTimedBlock } from './logging'
import { plannedSets } from './prescription'
import type { Block, Prescription } from './types'

/** A muscle in the anatomy reference (muscle_ref). */
export interface MuscleRef {
  name: string
  part: string
  grp: string
  side: 'front' | 'back' | 'other'
  half: 'upper' | 'core' | 'lower' | 'other'
  ppl: 'push' | 'pull' | 'legs' | 'other'
  position: number
}

/** One planned exercise on one day, with what the overview needs. */
export interface PlanItem {
  date: string
  dayName: string
  position: number
  block: Block
  name: string
  slug: string
  groupName: string | null
  minutes: number
  /** Planned work sets (warm-ups and mobility count 0). */
  sets: number
  /** Work sets logged so far. */
  done: number
  muscles: string[]
  feats: string[]
}

export const BLOCK_ORDER: Block[] = ['warmup', 'skill', 'power', 'strength', 'conditioning', 'accessory', 'mobility']
export const BLOCK_LABELS: Record<Block, string> = {
  warmup: 'Warm-up',
  skill: 'Skill',
  power: 'Power',
  strength: 'Strength',
  conditioning: 'Running',
  accessory: 'Accessories',
  mobility: 'Mobility',
}

/**
 * Rough time for an exercise in seconds: sets × (work + rest), a lift ladder with its
 * warm-ups and rests, a timed block at the middle of its range, plus 30 s to move on.
 */
export function estimateSeconds(p: Prescription, block: Block): number {
  const sides = p.per_side ? 2 : 1
  const mid = (a: number, b?: number) => (a + (b ?? a)) / 2
  const sets = p.sets ?? 1
  let s: number
  if (p.scheme === 'ladder') s = 60 + (p.warmups?.length ?? 0) * (40 + 90) + (p.steps?.length ?? 0) * (30 + (p.rest_s ?? 180))
  else if (p.minutes !== undefined) s = 60 * mid(p.minutes, p.minutes_max)
  else if (p.contacts !== undefined) s = mid(p.contacts, p.contacts_max) * (4 + (p.rest_s ?? 0)) + 60
  else if (p.distance_m !== undefined && p.target_seconds !== undefined) s = sets * (p.target_seconds + (p.rest_s ?? 120))
  else if (p.distance_m !== undefined) s = sets * sides * ((block === 'power' ? 8 : 40) + (p.rest_s ?? 60))
  else if (p.seconds !== undefined) s = sets * (sides * p.seconds + (p.rest_s ?? (block === 'mobility' ? 15 : 45)))
  else if (p.reps !== undefined)
    s = sets * (sides * 3 * mid(p.reps, p.reps_max) + (p.rest_s ?? (block === 'mobility' || block === 'warmup' ? 15 : 45)))
  else s = 120
  return s + 30
}

/** Work sets an exercise counts for: warm-ups and mobility don't count, a timed block is one. */
export function workSets(p: Prescription, block: Block): number {
  if (block === 'warmup' || block === 'mobility') return 0
  if (isTimedBlock(p)) return 1
  return plannedSets(p).filter((s) => !s.isWarmup).length
}

type Row = {
  date: string
  name: string
  session_exercises: {
    position: number
    block: Block
    skipped: boolean
    prescription: Prescription
    exercise: {
      name: string
      slug: string
      group_name: string | null
      muscle_detail: string[] | null
      feat: { name: string } | null
      links: { feat: { name: string } }[]
    } | null
    sets: { is_warmup: boolean }[]
  }[]
}

export async function loadPlan(db: SupabaseClient, start: string, end: string): Promise<{ items: PlanItem[]; muscles: MuscleRef[] }> {
  const [rows, muscles] = await Promise.all([
    db
      .from('sessions')
      .select(
        'date, name, session_exercises(position, block, skipped, prescription, sets(is_warmup), ' +
          'exercise:exercises(name, slug, group_name, muscle_detail, feat:feats(name), links:exercise_feats(feat:feats(name))))',
      )
      .gte('date', start)
      .lte('date', end)
      .order('date'),
    db.from('muscle_ref').select('*').order('position'),
  ])
  return { items: toItems(check<Row[]>(rows)), muscles: check<MuscleRef[]>(muscles) }
}

export function toItems(rows: Row[]): PlanItem[] {
  return rows.flatMap((r) =>
    r.session_exercises
      .filter((se) => !se.skipped && se.exercise)
      .sort((a, b) => a.position - b.position)
      .map((se) => {
        const e = se.exercise!
        const feats = [...new Set([...(e.feat ? [e.feat.name] : []), ...e.links.map((l) => l.feat.name)])].sort()
        return {
          date: r.date,
          dayName: r.name,
          position: se.position,
          block: se.block,
          name: e.name,
          slug: e.slug,
          groupName: e.group_name,
          minutes: estimateSeconds(se.prescription, se.block) / 60,
          sets: workSets(se.prescription, se.block),
          done: se.block === 'warmup' || se.block === 'mobility' ? 0 : se.sets.filter((s) => !s.is_warmup).length,
          muscles: e.muscle_detail ?? [],
          feats,
        }
      }),
  )
}

/** Minutes per block for each day, blocks in the order they come in the day. */
export function dayParts(items: PlanItem[]): Map<string, { block: Block; minutes: number }[]> {
  const out = new Map<string, { block: Block; minutes: number }[]>()
  for (const i of items) {
    const parts = out.get(i.date) ?? []
    const part = parts.find((p) => p.block === i.block)
    if (part) part.minutes += i.minutes
    else parts.push({ block: i.block, minutes: i.minutes })
    out.set(i.date, parts)
  }
  return out
}

/** Ways to lay out the muscle tree: the levels from the top row down to single muscles. */
export type MuscleView = 'parts' | 'side' | 'half' | 'ppl' | 'flat'
export const MUSCLE_VIEWS: Record<MuscleView, { label: string; levels: ((m: MuscleRef) => string)[] }> = {
  parts: { label: 'Body parts', levels: [(m) => m.part, (m) => m.grp] },
  side: { label: 'Front / back', levels: [(m) => cap(m.side), (m) => m.part] },
  half: { label: 'Upper / lower', levels: [(m) => cap(m.half === 'core' ? 'core' : m.half === 'other' ? 'other' : m.half + ' body'), (m) => m.part] },
  ppl: { label: 'Push / pull / legs', levels: [(m) => cap(m.ppl), (m) => m.part] },
  flat: { label: 'Most sets', levels: [] },
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** A row of the muscle tree: a group (with children) or a single muscle. */
export interface MuscleNode {
  key: string
  label: string
  depth: number
  /** Sets per column. An exercise counts once per node however many of its muscles fall inside. */
  values: number[]
  total: number
  /** Columns with any sets. */
  active: number
  children: MuscleNode[]
}

/**
 * The muscle tree for a view. `columns` are lists of dates (a day, or a week); `measure`
 * picks planned or logged sets. Groups keep body order (head to toe); the flat view
 * sorts by most sets.
 */
export function muscleTree(
  items: PlanItem[],
  refs: MuscleRef[],
  view: MuscleView,
  columns: string[][],
  measure: 'sets' | 'done' = 'sets',
): MuscleNode[] {
  const byName = new Map(refs.map((r) => [r.name, r]))
  const work = items.filter((i) => i[measure] > 0)
  const levels = MUSCLE_VIEWS[view].levels
  const col = new Map(columns.flatMap((dates, c) => dates.map((d) => [d, c] as const)))

  const build = (members: MuscleRef[], depth: number, prefix: string): MuscleNode[] => {
    const level = levels[depth]
    if (!level) {
      return members.map((m) => node(prefix + m.name, m.name, depth, [m], []))
    }
    const groups = new Map<string, MuscleRef[]>()
    for (const m of members) groups.set(level(m), [...(groups.get(level(m)) ?? []), m])
    return [...groups.entries()].map(([label, ms]) => {
      const key = prefix + label + '/'
      return node(key, label, depth, ms, build(ms, depth + 1, key))
    })
  }
  const node = (key: string, label: string, depth: number, ms: MuscleRef[], children: MuscleNode[]): MuscleNode => {
    const names = new Set(ms.map((m) => m.name))
    const values = columns.map(() => 0)
    for (const i of work) {
      const c = col.get(i.date)
      if (c !== undefined && i.muscles.some((m) => names.has(m))) values[c] += i[measure]
    }
    return { key, label, depth, values, total: values.reduce((a, b) => a + b, 0), active: values.filter(Boolean).length, children }
  }

  const unknown = [...new Set(items.flatMap((i) => i.muscles))].filter((m) => !byName.has(m))
  const all = [...refs, ...unknown.map((name, n) => ({ name, part: 'Other', grp: 'Other', side: 'other', half: 'other', ppl: 'other', position: 1000 + n }) as MuscleRef)]
  const tree = build(all, 0, '')
  return view === 'flat' ? tree.sort((a, b) => b.total - a.total || a.label.localeCompare(b.label)) : tree
}

/** Sets or minutes per feat per column, most-worked first. */
export function featTable(items: PlanItem[], columns: string[][], measure: 'sets' | 'minutes') {
  const col = new Map(columns.flatMap((dates, c) => dates.map((d) => [d, c] as const)))
  const map = new Map<string, number[]>()
  for (const i of items) {
    const c = col.get(i.date)
    if (c === undefined) continue
    const v = measure === 'sets' ? i.sets : i.minutes
    if (!v) continue
    for (const f of i.feats) {
      const values = map.get(f) ?? columns.map(() => 0)
      values[c] += v
      map.set(f, values)
    }
  }
  return [...map.entries()]
    .map(([feat, values]) => ({
      feat,
      values: measure === 'minutes' ? values.map(Math.round) : values,
      total: Math.round(values.reduce((a, b) => a + b, 0)),
      active: values.filter(Boolean).length,
    }))
    .sort((a, b) => b.active - a.active || b.total - a.total)
}

/** Feat kinds, for colour. */
export const FEAT_KINDS: { name: string; feats: string[] }[] = [
  { name: 'Strength', feats: ['315 bench', '315 squat', '405 deadlift'] },
  { name: 'Jumping', feats: ['One-hand dunk', 'Two-hand dunk'] },
  { name: 'Running', feats: ['Sub-6:00 mile', 'Sub-24:00 5K'] },
  { name: 'Skills', feats: ['Front lever', 'Wall handstand push-up', 'Press to handstand', 'Straddle planche', 'One-arm pull-up', 'Backflip'] },
  { name: 'Flexibility', feats: ['Front splits, both sides', 'Pancake', 'Middle split', 'Full bridge'] },
]
export function featKind(feat: string): number {
  const i = FEAT_KINDS.findIndex((k) => k.feats.includes(feat))
  return i < 0 ? FEAT_KINDS.length - 1 : i
}

/** Where each specific muscle is drawn on the body map. */
export const REGION_OF: Record<string, string> = {
  'neck flexors': 'neck',
  'neck extensors': 'neck',
  'front delts': 'front delts',
  'side delts': 'side delts',
  'rear delts': 'rear delts',
  supraspinatus: 'rotator cuff',
  infraspinatus: 'rotator cuff',
  'teres minor': 'rotator cuff',
  subscapularis: 'rotator cuff',
  'upper chest': 'chest',
  'mid chest': 'chest',
  'lower chest': 'chest',
  'serratus anterior': 'chest',
  'upper traps': 'traps',
  'mid traps': 'upper back',
  'lower traps': 'upper back',
  rhomboids: 'upper back',
  lats: 'lats',
  'teres major': 'lats',
  'thoracic spine': 'lower back',
  'erector spinae': 'lower back',
  'quadratus lumborum': 'lower back',
  biceps: 'biceps',
  brachialis: 'biceps',
  'triceps long head': 'triceps',
  'triceps lateral and medial heads': 'triceps',
  brachioradialis: 'forearms',
  'forearm flexors': 'forearms',
  'forearm extensors': 'forearms',
  wrists: 'wrists',
  'rectus abdominis': 'core',
  'transverse abdominis': 'core',
  obliques: 'obliques',
  'hip flexors': 'hip flexors',
  'glute max': 'glutes',
  'glute med': 'glutes',
  'glute min': 'glutes',
  'deep hip rotators': 'glutes',
  adductors: 'adductors',
  'rectus femoris': 'quads',
  'vastus lateralis': 'quads',
  'vastus medialis': 'quads',
  'biceps femoris': 'hamstrings',
  'inner hamstrings': 'hamstrings',
  gastrocnemius: 'calves',
  soleus: 'calves',
  'tibialis anterior': 'shins',
  peroneals: 'shins',
  'foot intrinsics': 'feet',
  'toe flexors': 'feet',
}

/**
 * Weekly sets a region needs to count as trained: about 10 for big movers, less for
 * small or stabilising ones. A starting point to judge balance, not a rule.
 */
export const REGION_TARGET: Record<string, number> = {
  chest: 10,
  lats: 10,
  'upper back': 10,
  quads: 10,
  hamstrings: 10,
  glutes: 10,
  'front delts': 6,
  'side delts': 8,
  'rear delts': 8,
  biceps: 8,
  triceps: 8,
  traps: 6,
  core: 8,
  obliques: 6,
  'lower back': 6,
  adductors: 6,
  calves: 8,
  'hip flexors': 4,
  'rotator cuff': 6,
  neck: 4,
  forearms: 4,
  wrists: 3,
  shins: 4,
  feet: 4,
}

/**
 * Sets per body-map region in an average week: an exercise counts in full for the
 * regions of its two main movers and half for the rest, once per region.
 */
export function regionBalance(items: PlanItem[], weeks: number, measure: 'sets' | 'done' = 'sets') {
  const sets: Record<string, number> = {}
  for (const i of items) {
    if (!i[measure]) continue
    const weight: Record<string, number> = {}
    i.muscles.forEach((m, n) => {
      const r = REGION_OF[m]
      if (r) weight[r] = Math.max(weight[r] ?? 0, n < 2 ? 1 : 0.5)
    })
    for (const [r, w] of Object.entries(weight)) sets[r] = (sets[r] ?? 0) + i[measure] * w
  }
  return Object.entries(REGION_TARGET)
    .map(([region, target]) => {
      const perWeek = (sets[region] ?? 0) / Math.max(1, weeks)
      return { region, perWeek: Math.round(perWeek * 2) / 2, target, ratio: perWeek / target }
    })
    .sort((a, b) => a.ratio - b.ratio)
}

const STOPS: [number, [number, number, number]][] = [
  [0, [220, 38, 38]], // red: nothing
  [0.5, [245, 158, 11]], // amber: half the target
  [1, [22, 163, 74]], // green: on target
  [2, [8, 145, 178]], // teal: well past it
]

/** Red → amber → green → teal as sets go from none to twice the target. */
export function balanceColor(ratio: number): string {
  const r = Math.max(0, Math.min(2, ratio))
  const i = Math.max(0, STOPS.findIndex(([at]) => at >= r) - 1)
  const [a, ca] = STOPS[i]
  const [b, cb] = STOPS[Math.min(i + 1, STOPS.length - 1)]
  const t = b === a ? 0 : (r - a) / (b - a)
  const mix = ca.map((v, k) => Math.round(v + (cb[k] - v) * t))
  return `rgb(${mix.join(' ')})`
}

/** Colours for blocks and groups that read in light and dark mode. */
export const BLOCK_COLORS: Record<Block, string> = {
  warmup: '#a8a29e',
  skill: '#8b5cf6',
  power: '#f97316',
  strength: '#2563eb',
  conditioning: '#e11d48',
  accessory: '#14b8a6',
  mobility: '#84cc16',
}
export const GROUP_COLORS = ['#2563eb', '#f97316', '#14b8a6', '#8b5cf6', '#e11d48', '#ca8a04', '#64748b']
