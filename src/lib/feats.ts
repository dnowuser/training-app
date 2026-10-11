import type { SupabaseClient } from '@supabase/supabase-js'
import { check, logChange } from './api'
import type { Feat, FeatProgress, FeatStage, FeatStep, Milestone } from './types'

export interface FeatDetail {
  feat: Feat
  steps: FeatStep[]
  milestones: Milestone[]
}

export async function loadFeats(db: SupabaseClient): Promise<FeatProgress[]> {
  const rows = check<FeatProgress[]>(await db.from('feat_progress').select('*').order('position'))
  // count() comes back as a string from PostgREST views on some setups.
  return rows.map((r) => ({ ...r, steps_total: Number(r.steps_total), steps_done: Number(r.steps_done) }))
}

export async function loadFeat(db: SupabaseClient, slug: string): Promise<FeatDetail> {
  const feat = check<Feat>(await db.from('feats').select('*').eq('slug', slug).single())
  const [steps, milestones] = await Promise.all([
    db.from('feat_steps').select('*').eq('feat_id', feat.id).order('step_number'),
    db.from('milestones').select('*').eq('feat_id', feat.id).order('achieved_on', { ascending: false }),
  ])
  return { feat, steps: check<FeatStep[]>(steps), milestones: check<Milestone[]>(milestones) }
}

/** The step to work on next: the first one not achieved. */
export function currentStep(steps: FeatStep[]): FeatStep | undefined {
  return steps.find((s) => !s.achieved_on)
}

/**
 * Mark a ladder step as hit: dates the step, records a milestone, and when it's
 * the feat itself (is_goal, not a bonus) marks the feat achieved. Returns the milestone.
 */
export async function markStep(
  db: SupabaseClient,
  feat: Pick<Feat, 'id' | 'name'>,
  step: FeatStep,
  date: string,
  note: string,
): Promise<Milestone> {
  check(await db.from('feat_steps').update({ achieved_on: date }).eq('id', step.id))
  const milestone = check<Milestone>(
    await db
      .from('milestones')
      .insert({ feat_id: feat.id, feat_step_id: step.id, title: `${feat.name}: ${step.description}`, achieved_on: date, note: note || null })
      .select()
      .single(),
  )
  if (step.is_goal && !step.is_bonus) {
    check(await db.from('feats').update({ achieved_on: date, stage: 'achieved' }).eq('id', feat.id))
  }
  await logChange(db, {
    summary: `${feat.name}: hit step ${step.step_number} (${step.description})`,
    affects_from: date,
    details: { feat_step_id: step.id, milestone_id: milestone.id },
  })
  return milestone
}

/** Undo a step marked by mistake. Its milestone is removed too (the caller confirms). */
export async function unmarkStep(db: SupabaseClient, feat: Feat, step: FeatStep): Promise<void> {
  check(await db.from('feat_steps').update({ achieved_on: null }).eq('id', step.id))
  check(await db.from('milestones').delete().eq('feat_step_id', step.id))
  if (step.is_goal && !step.is_bonus && feat.stage === 'achieved') {
    check(await db.from('feats').update({ achieved_on: null, stage: 'now' }).eq('id', feat.id))
  }
  await logChange(db, {
    summary: `${feat.name}: step ${step.step_number} unmarked`,
    reason: 'Marked by mistake',
    details: { feat_step_id: step.id },
  })
}

export async function setStage(db: SupabaseClient, feat: Feat, stage: FeatStage): Promise<void> {
  check(await db.from('feats').update({ stage }).eq('id', feat.id))
  await logChange(db, { summary: `${feat.name}: stage ${feat.stage} -> ${stage}` })
}

/** A result worth keeping that isn't a ladder step: a PR, a time trial. */
export async function addMilestone(
  db: SupabaseClient,
  feat: Feat,
  title: string,
  date: string,
  note: string,
): Promise<Milestone> {
  return check<Milestone>(
    await db
      .from('milestones')
      .insert({ feat_id: feat.id, title, achieved_on: date, note: note || null })
      .select()
      .single(),
  )
}
