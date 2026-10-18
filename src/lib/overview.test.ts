import { describe, expect, it } from 'vitest'
import { balanceColor, estimateSeconds, featTable, muscleBalance, muscleTree, regionBalance, workSets, type MuscleRef, type PlanItem } from './overview'

const ref = (name: string, part: string, grp: string, side: MuscleRef['side'], position: number): MuscleRef => ({
  name,
  part,
  grp,
  side,
  half: 'upper',
  ppl: 'pull',
  position,
})
const refs = [
  ref('upper traps', 'Back', 'Traps', 'back', 1),
  ref('lats', 'Back', 'Lats', 'back', 2),
  ref('biceps', 'Arms', 'Biceps', 'front', 3),
]
const item = (date: string, sets: number, muscles: string[], feats: string[] = [], minutes = 5): PlanItem => ({
  date,
  dayName: 'Day',
  position: 1,
  block: 'accessory',
  name: 'x',
  slug: 'x',
  groupName: null,
  minutes,
  sets,
  done: 0,
  muscles,
  feats,
})

describe('estimates', () => {
  it('times a ladder, a timed block and sets with rest', () => {
    const ladder = { scheme: 'ladder' as const, warmups: [{ pct: 33, reps: 10 }, { pct: 56, reps: 10 }], steps: [{ pct: 79, reps: 5 }, { pct: 96, reps: 1 }], rest_s: 180 }
    expect(estimateSeconds(ladder, 'strength')).toBe(60 + 2 * 130 + 2 * 210 + 30)
    expect(estimateSeconds({ minutes: 10 }, 'skill')).toBe(630)
    expect(estimateSeconds({ sets: 2, reps: 10, rest_s: 60 }, 'accessory')).toBe(2 * (30 + 60) + 30)
  })

  it('counts work sets but not warm-ups or mobility', () => {
    expect(workSets({ sets: 3, reps: 5 }, 'accessory')).toBe(3)
    expect(workSets({ sets: 3, seconds: 40 }, 'mobility')).toBe(0)
    expect(workSets({ minutes: 10 }, 'skill')).toBe(1)
  })
})

describe('muscleTree', () => {
  const items = [item('a', 4, ['lats', 'biceps']), item('b', 2, ['upper traps', 'lats'])]

  it('rolls muscles up into parts, counting an exercise once per row', () => {
    const tree = muscleTree(items, refs, 'parts', [['a'], ['b']])
    expect(tree.map((n) => [n.label, n.values])).toEqual([
      ['Back', [4, 2]],
      ['Arms', [4, 0]],
    ])
    expect(tree[0].children.map((n) => n.label)).toEqual(['Traps', 'Lats'])
    expect(tree[0].children[1].children[0]).toMatchObject({ label: 'lats', total: 6, active: 2 })
  })

  it('splits front and back, and lists single muscles by most sets', () => {
    expect(muscleTree(items, refs, 'side', [['a', 'b']]).map((n) => [n.label, n.total])).toEqual([
      ['Back', 6],
      ['Front', 4],
    ])
    expect(muscleTree(items, refs, 'flat', [['a', 'b']]).map((n) => n.label)).toEqual(['lats', 'biceps', 'upper traps'])
  })
})

describe('featTable', () => {
  it('sums sets or minutes per feat and sorts by days worked', () => {
    const items = [item('a', 3, [], ['Pancake'], 4), item('a', 0, [], ['Front lever'], 6), item('b', 2, [], ['Front lever'], 5)]
    expect(featTable(items, [['a'], ['b']], 'sets').map((r) => [r.feat, r.values])).toEqual([
      ['Pancake', [3, 0]],
      ['Front lever', [0, 2]],
    ])
    expect(featTable(items, [['a'], ['b']], 'minutes')[0]).toMatchObject({ feat: 'Front lever', values: [6, 5], active: 2 })
  })
})

describe('regionBalance', () => {
  it('counts main movers in full and helpers by half, per average week', () => {
    const items = [item('a', 4, ['lats', 'biceps', 'rear delts']), item('b', 2, ['mid chest'])]
    const by = Object.fromEntries(regionBalance(items, 2).map((r) => [r.region, r.perWeek]))
    expect(by.lats).toBe(2)
    expect(by['rear delts']).toBe(1)
    expect(by.chest).toBe(1)
    expect(by.hamstrings).toBe(0)
  })

  it('goes red to green as sets reach the target', () => {
    expect(balanceColor(0)).toBe('rgb(220 38 38)')
    expect(balanceColor(1)).toBe('rgb(22 163 74)')
  })
})

describe('muscleBalance', () => {
  it('scores each specific muscle against its region target', () => {
    const r = [ref('lats', 'Back', 'Lats', 'back', 1), ref('biceps', 'Arms', 'Biceps', 'front', 2)]
    const rows = muscleBalance([item('a', 4, ['lats', 'biceps'])], r, 1)
    expect(rows.find((x) => x.muscle === 'lats')).toMatchObject({ perWeek: 4, target: 10 })
    expect(rows[0].muscle).toBe('lats')
  })
})
