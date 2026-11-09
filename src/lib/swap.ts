import type { Exercise } from './types'

export interface SwapOption {
  exercise: Exercise
  /** Muscles it shares with the exercise being swapped, main movers first. */
  shared: string[]
  score: number
}

/** Weight of a muscle by where it sits in muscle_detail: main movers count most. */
const weight = (index: number) => 1 / (index + 1)

/**
 * Exercises that work the same muscles as `current`, best match first. A candidate
 * has to share one of `current`'s two main movers among its own first three;
 * stretches only swap for stretches. Ranked by shared muscles, weighted by how
 * high each sits in both lists.
 */
export function swapOptions(current: Exercise, library: Exercise[], limit = 8): SwapOption[] {
  const mine = current.muscle_detail ?? []
  const main = mine.slice(0, 2)
  if (main.length === 0) return []
  const isStretch = current.area === 'mobility'
  const options: SwapOption[] = []
  for (const ex of library) {
    if (ex.id === current.id || (ex.area === 'mobility') !== isStretch) continue
    const theirs = ex.muscle_detail ?? []
    if (!main.some((m) => theirs.slice(0, 3).includes(m))) continue
    const shared = mine.filter((m) => theirs.includes(m))
    const score = shared.reduce((sum, m) => sum + weight(mine.indexOf(m)) * weight(theirs.indexOf(m)), 0)
    options.push({ exercise: ex, shared, score })
  }
  return options.sort((a, b) => b.score - a.score || a.exercise.name.localeCompare(b.exercise.name)).slice(0, limit)
}
