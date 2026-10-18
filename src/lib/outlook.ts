import type { SupabaseClient } from '@supabase/supabase-js'
import { check } from './api'
import { addDays, localISODate, parseISODate } from './dates'
import type { Point } from './progress'

/**
 * How each feat is measured and how fast it can move. Projections are ambitious but
 * realistic: gains shrink every month (diminishing returns), and ladders use the fast
 * end of each feat's usual time range. They're a pace to beat, not a promise.
 */
export type FeatModel =
  | {
      kind: 'metric'
      metric: 'training_max' | 'mile_time' | '5k_time' | 'touch_height'
      exercise?: string
      goal: number
      unit: 'lb' | 'time' | 'in'
      /** Change in the first month: lb or inches added, or the share of time cut. */
      first: number
      /** Each month's change is this fraction of the month before. */
      decay: number
      /** Without a measurement, fall back to the ladder at this pace. */
      fallbackMonths: number
    }
  | { kind: 'ladder'; months: number }

export const FEAT_MODELS: Record<string, FeatModel> = {
  'bench-315': { kind: 'metric', metric: 'training_max', exercise: 'bench-press', goal: 315, unit: 'lb', first: 10, decay: 0.92, fallbackMonths: 24 },
  'squat-315': { kind: 'metric', metric: 'training_max', exercise: 'back-squat', goal: 315, unit: 'lb', first: 12, decay: 0.9, fallbackMonths: 4 },
  'deadlift-405': { kind: 'metric', metric: 'training_max', exercise: 'deadlift', goal: 405, unit: 'lb', first: 12, decay: 0.9, fallbackMonths: 5 },
  'mile-sub-6': { kind: 'metric', metric: 'mile_time', goal: 359, unit: 'time', first: 0.025, decay: 0.93, fallbackMonths: 9 },
  '5k-sub-24': { kind: 'metric', metric: '5k_time', goal: 1439, unit: 'time', first: 0.025, decay: 0.93, fallbackMonths: 5 },
  'one-hand-dunk': { kind: 'metric', metric: 'touch_height', goal: 126, unit: 'in', first: 0.8, decay: 0.95, fallbackMonths: 12 },
  'two-hand-dunk': { kind: 'metric', metric: 'touch_height', goal: 130, unit: 'in', first: 0.8, decay: 0.95, fallbackMonths: 24 },
  backflip: { kind: 'ladder', months: 2 },
  'handstand-push-up': { kind: 'ladder', months: 4 },
  'front-splits': { kind: 'ladder', months: 6 },
  'full-bridge': { kind: 'ladder', months: 6 },
  pancake: { kind: 'ladder', months: 6 },
  'front-lever': { kind: 'ladder', months: 12 },
  'middle-split': { kind: 'ladder', months: 12 },
  'one-arm-pull-up': { kind: 'ladder', months: 18 },
  'press-handstand': { kind: 'ladder', months: 24 },
  'straddle-planche': { kind: 'ladder', months: 36 },
}

export interface FeatRow {
  id: string
  slug: string
  name: string
  stage: string
  steps: { step_number: number; achieved_on: string | null }[]
}
export interface MetricRow {
  kind: string
  value: number
  measured_on: string
  exercise_slug: string | null
}

export interface Outlook {
  slug: string
  name: string
  stage: string
  unit: 'lb' | 'time' | 'in' | 'steps'
  goal: number
  history: Point[]
  projection: Point[]
  /** Projected date the goal is reached, if within the horizon. */
  eta: string | null
  done: boolean
  /** Plain words on what the line is. */
  basis: string
}

const HORIZON_MONTHS = 48
const DAYS_PER_MONTH = 30.44
const monthsBetween = (a: string, b: string) => (parseISODate(b).getTime() - parseISODate(a).getTime()) / (DAYS_PER_MONTH * 864e5)
const plusMonths = (iso: string, m: number) => addDays(iso, Math.round(m * DAYS_PER_MONTH))

/** Month-by-month projection of a measured feat from its latest value until it reaches the goal. */
export function projectMetric(
  model: Extract<FeatModel, { kind: 'metric' }>,
  from: Point,
  horizon = HORIZON_MONTHS,
): { points: Point[]; eta: string | null } {
  const down = model.unit === 'time'
  const reached = (v: number) => (down ? v <= model.goal : v >= model.goal)
  const points: Point[] = [from]
  if (reached(from.y)) return { points, eta: from.x }
  let v = from.y
  let step = model.first
  for (let m = 1; m <= horizon; m++) {
    const next = down ? v * (1 - step) : v + step
    step *= model.decay
    if (reached(next)) {
      // The month it crosses: place the goal date in proportion to how far through the month it is.
      const frac = Math.abs(model.goal - v) / Math.abs(next - v)
      const eta = plusMonths(from.x, m - 1 + frac)
      points.push({ x: eta, y: model.goal })
      return { points, eta }
    }
    v = next
    points.push({ x: plusMonths(from.x, m), y: Math.round(v * 10) / 10 })
  }
  return { points, eta: null }
}

/**
 * Projection of a ladder: steps done so far, then steps at the planned pace (or the
 * pace you've actually shown, if faster) until the last step.
 */
export function projectLadder(months: number, steps: FeatRow['steps'], start: string, today: string) {
  const total = steps.length
  const doneDates = steps.map((s) => s.achieved_on).filter((d): d is string => !!d).sort()
  const history: Point[] = [{ x: start < today ? start : today, y: 0 }, ...doneDates.map((d, i) => ({ x: d, y: i + 1 }))]
  const done = doneDates.length
  const planPace = months / Math.max(1, total)
  const shown = done >= 2 ? monthsBetween(start, doneDates.at(-1)!) / done : Infinity
  const pace = Math.min(planPace, shown)
  const from = { x: today, y: done }
  if (done >= total) return { history, projection: [], eta: doneDates.at(-1) ?? today }
  const projection: Point[] = [from]
  for (let s = done + 1; s <= total; s++) projection.push({ x: plusMonths(today, (s - done) * pace), y: s })
  return { history, projection, eta: projection.at(-1)!.x }
}

export function outlooks(feats: FeatRow[], metrics: MetricRow[], start: string, today = localISODate()): Outlook[] {
  return feats.map((f) => {
    const model = FEAT_MODELS[f.slug] ?? { kind: 'ladder', months: 12 }
    if (model.kind === 'metric') {
      const history = metrics
        .filter((m) => m.kind === model.metric && (!model.exercise || m.exercise_slug === model.exercise))
        .map((m) => ({ x: m.measured_on, y: Number(m.value) }))
      // One point per day: the latest that day.
      const byDay = [...new Map(history.map((p) => [p.x, p])).values()].sort((a, b) => a.x.localeCompare(b.x))
      if (byDay.length) {
        const last = byDay.at(-1)!
        const { points, eta } = projectMetric(model, { x: last.x < today ? today : last.x, y: last.y })
        const reached = model.unit === 'time' ? last.y <= model.goal : last.y >= model.goal
        return {
          slug: f.slug,
          name: f.name,
          stage: f.stage,
          unit: model.unit,
          goal: model.goal,
          history: byDay,
          projection: reached ? [] : points,
          eta,
          done: reached,
          basis:
            model.metric === 'training_max'
              ? 'Training max'
              : model.metric === 'touch_height'
                ? 'Max touch height'
                : model.metric === 'mile_time'
                  ? 'Mile time trial'
                  : '5K time trial',
        }
      }
      const l = projectLadder(model.fallbackMonths, f.steps, start, today)
      return { slug: f.slug, name: f.name, stage: f.stage, unit: 'steps', goal: f.steps.length, ...l, done: false, basis: 'Ladder steps (record a measurement for a real projection)' }
    }
    const l = projectLadder(model.months, f.steps, start, today)
    const done = f.steps.length > 0 && f.steps.every((s) => s.achieved_on)
    return { slug: f.slug, name: f.name, stage: f.stage, unit: 'steps', goal: f.steps.length, ...l, done, basis: 'Ladder steps' }
  })
}

export async function loadOutlooks(db: SupabaseClient, start: string): Promise<Outlook[]> {
  const [feats, metrics] = await Promise.all([
    db.from('feats').select('id, slug, name, stage, steps:feat_steps(step_number, achieved_on)').order('name'),
    db.from('metrics').select('kind, value, measured_on, exercise:exercises(slug)').order('measured_on').order('created_at'),
  ])
  type M = { kind: string; value: number; measured_on: string; exercise: { slug: string } | null }
  return outlooks(
    check<FeatRow[]>(feats),
    check<M[]>(metrics).map((m) => ({ kind: m.kind, value: Number(m.value), measured_on: m.measured_on, exercise_slug: m.exercise?.slug ?? null })),
    start,
  )
}
