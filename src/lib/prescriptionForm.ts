import type { LadderStep, Prescription } from './types'

/** Number fields of a prescription, in the order the editor shows them. */
export const NUMBER_FIELDS = [
  ['sets', 'Sets'],
  ['sets_max', 'Sets (max)'],
  ['reps', 'Reps'],
  ['reps_max', 'Reps (max)'],
  ['load_lb', 'Load (lb)'],
  ['pct_tm', '% training max'],
  ['seconds', 'Seconds'],
  ['seconds_max', 'Seconds (max)'],
  ['minutes', 'Minutes'],
  ['minutes_max', 'Minutes (max)'],
  ['distance_m', 'Distance (m)'],
  ['target_seconds', 'Target time (s)'],
  ['contacts', 'Contacts'],
  ['contacts_max', 'Contacts (max)'],
  ['rest_s', 'Rest (s)'],
] as const satisfies readonly (readonly [keyof Prescription, string])[]

export type NumberField = (typeof NUMBER_FIELDS)[number][0]

export interface PrescriptionFormValues {
  numbers: Record<NumberField, string>
  perSide: boolean
  intensity: string
  ladder: boolean
  /** "40x5, 55x3, 70x2" */
  warmups: string
  /** "79x5, 86x3, 91x1, 96x1" */
  steps: string
}

/** "79x5, 86x3" <-> [{pct: 79, reps: 5}, {pct: 86, reps: 3}] */
export function formatLadder(steps: LadderStep[] | undefined): string {
  return (steps ?? []).map((s) => `${s.pct}x${s.reps}`).join(', ')
}

export function parseLadder(text: string): LadderStep[] | null {
  const parts = text
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  const steps: LadderStep[] = []
  for (const part of parts) {
    const m = /^(\d+(?:\.\d+)?)\s*%?\s*[x×]\s*(\d+)$/i.exec(part)
    if (!m) return null
    steps.push({ pct: Number(m[1]), reps: Number(m[2]) })
  }
  return steps
}

export function toFormValues(p: Prescription): PrescriptionFormValues {
  const numbers = {} as Record<NumberField, string>
  for (const [key] of NUMBER_FIELDS) numbers[key] = p[key] !== undefined ? String(p[key]) : ''
  return {
    numbers,
    perSide: Boolean(p.per_side),
    intensity: p.intensity ?? '',
    ladder: p.scheme === 'ladder',
    warmups: formatLadder(p.warmups),
    steps: formatLadder(p.steps),
  }
}

/** Build a prescription from the form, or an error message. Blank fields are left out. */
export function fromFormValues(v: PrescriptionFormValues, base: Prescription = {}): Prescription | string {
  const p: Prescription = {}
  if (base.deload) p.deload = true
  if (v.ladder) {
    const warmups = parseLadder(v.warmups)
    const steps = parseLadder(v.steps)
    if (!warmups || !steps || !steps.length) return 'Write ladder steps like 79x5, 86x3, 91x1.'
    p.scheme = 'ladder'
    p.warmups = warmups
    p.steps = steps
  }
  for (const [key, label] of NUMBER_FIELDS) {
    const text = v.numbers[key].trim()
    if (!text) continue
    const n = Number(text)
    if (!Number.isFinite(n) || n < 0) return `${label} must be a number.`
    p[key] = n
  }
  if (v.perSide) p.per_side = true
  if (v.intensity.trim()) p.intensity = v.intensity.trim()
  return p
}
