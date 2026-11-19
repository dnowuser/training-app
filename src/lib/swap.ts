import type { Exercise } from './types'

export interface SwapOption {
  exercise: Exercise
  /** Muscles it shares with the exercise being swapped, main movers first. */
  shared: string[]
  score: number
}

/** Weight of a muscle by where it sits in muscle_detail: main movers count most. */
const weight = (index: number) => 1 / (index + 1)

/** Movement patterns, by a word in the exercise's name. Same pattern = the closest swap (a row for a row). */
const PATTERNS = ['row', 'curl', 'press', 'raise', 'fly', 'squat', 'deadlift', 'lunge', 'pull-up', 'chin-up', 'pulldown', 'dip', 'extension', 'pushdown', 'crunch', 'plank', 'carry', 'thrust', 'shrug']

export function patternOf(name: string): string | null {
  const words = name.toLowerCase().split(/[\s()]+/)
  return PATTERNS.find((p) => words.some((w) => w === p || w === p + 's' || w === p + 'es')) ?? null
}

/** How much a shared movement pattern counts against shared muscles. */
const PATTERN_BONUS = 2

/**
 * Exercises that work the same muscles as `current`, best match first. The same
 * movement pattern (a row for a row) comes first; otherwise a candidate has to share
 * one of `current`'s two main movers among its own first three. Stretches only swap
 * for stretches. Ranked by shared muscles, weighted by how high each sits in both lists.
 */
export function swapOptions(current: Exercise, library: Exercise[], limit = 8): SwapOption[] {
  const mine = current.muscle_detail ?? []
  const main = mine.slice(0, 2)
  if (main.length === 0) return []
  const isStretch = current.area === 'mobility'
  const pattern = patternOf(current.name)
  const options: SwapOption[] = []
  for (const ex of library) {
    if (ex.id === current.id || (ex.area === 'mobility') !== isStretch) continue
    const theirs = ex.muscle_detail ?? []
    const shared = mine.filter((m) => theirs.includes(m))
    const samePattern = pattern !== null && patternOf(ex.name) === pattern && shared.length > 0
    if (!samePattern && !main.some((m) => theirs.slice(0, 3).includes(m))) continue
    const score =
      shared.reduce((sum, m) => sum + weight(mine.indexOf(m)) * weight(theirs.indexOf(m)), 0) + (samePattern ? PATTERN_BONUS : 0)
    options.push({ exercise: ex, shared, score })
  }
  return options.sort((a, b) => b.score - a.score || a.exercise.name.localeCompare(b.exercise.name)).slice(0, limit)
}
