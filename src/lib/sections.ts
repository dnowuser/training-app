import type { DayExercise } from './api'
import type { Block } from './types'

export interface Section {
  key: string
  block: Block
  items: DayExercise[]
  /** Runs of drills; a run with a name is drills sharing an exercise group. */
  groups: { key: string; name: string | null; items: DayExercise[] }[]
}

/** Consecutive exercises of a block form a section; inside it, consecutive drills of one group fold together. */
export function sectionsOf(items: DayExercise[]): Section[] {
  const sections: Section[] = []
  for (const item of items) {
    let section = sections.at(-1)
    if (!section || section.block !== item.block) {
      section = { key: `${item.block}-${sections.length}`, block: item.block, items: [], groups: [] }
      sections.push(section)
    }
    section.items.push(item)
    const name = item.exercise.group_name ?? null
    const group = section.groups.at(-1)
    if (group && name && group.name === name) group.items.push(item)
    else section.groups.push({ key: `${section.key}-${section.groups.length}`, name, items: [item] })
  }
  return sections
}
