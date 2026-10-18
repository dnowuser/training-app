// Row types for the Supabase tables in supabase/migrations.
// Hand-written for now; once the project exists, replace with generated types
// (supabase gen types typescript) and keep Prescription as the jsonb shape.

export type Area = 'lifting' | 'jumping' | 'running' | 'calisthenics' | 'mobility' | 'accessory' | 'movement'
export type FeatArea = 'lifting' | 'jumping' | 'running' | 'calisthenics' | 'mobility'
export type Measure = 'load_reps' | 'reps' | 'hold' | 'distance' | 'load_distance' | 'contacts' | 'duration'
export type Block = 'warmup' | 'skill' | 'power' | 'strength' | 'conditioning' | 'accessory' | 'mobility'
export type DayType = 'hard' | 'easy' | 'recovery' | 'rest'
export type SessionStatus = 'planned' | 'in_progress' | 'done' | 'partial' | 'skipped'
export type FeatStage = 'now' | 'next' | 'background' | 'achieved'
export type ChangeAuthor = 'user' | 'claude' | 'app'

export interface LadderStep {
  pct: number
  reps: number
}

/** Target for one exercise (template_items.prescription and session_exercises.prescription). */
export interface Prescription {
  sets?: number
  sets_max?: number
  reps?: number
  reps_max?: number
  per_side?: boolean
  /** Percent of the exercise's training max. */
  pct_tm?: number
  load_lb?: number
  seconds?: number
  seconds_max?: number
  minutes?: number
  minutes_max?: number
  distance_m?: number
  /** Goal time per rep, e.g. 90 for a 400 m at mile pace. */
  target_seconds?: number
  contacts?: number
  contacts_max?: number
  rest_s?: number
  intensity?: string
  scheme?: 'ladder'
  warmups?: LadderStep[]
  steps?: LadderStep[]
  /** Set by generate_sessions in deload weeks. */
  deload?: boolean
}

export interface Exercise {
  id: string
  slug: string
  name: string
  area: Area
  measure: Measure
  cues: string | null
  /** Feat whose ladder this exercise practises; the card shows its current step. */
  feat_id: string | null
  /** Muscles (or areas, for stretches) it works. */
  muscles: string[]
  /** Drills that belong together (e.g. "Foot work"); the day view folds them under one header. */
  group_name: string | null
}

/** A feat an exercise builds toward (exercise_feats). */
export interface FeatRef {
  id: string
  slug: string
  name: string
}

export interface Cycle {
  id: string
  name: string
  start_date: string
  weeks: number
  deload_weeks: number[]
  status: 'planned' | 'active' | 'done'
  notes: string | null
}

export interface TemplateSlot {
  id: string
  weekday: number
  name: string
  day_type: DayType
  mobility: string | null
  notes: string | null
}

export interface TemplateItem {
  id: string
  slot_id: string
  position: number
  exercise_id: string
  block: Block
  prescription: Prescription
  notes: string | null
  min_week: number | null
  max_week: number | null
  week_parity: 'odd' | 'even' | null
}

export interface Session {
  id: string
  date: string
  cycle_id: string | null
  week: number | null
  slot_id: string | null
  name: string
  day_type: DayType
  is_deload: boolean
  customized: boolean
  status: SessionStatus
  started_at: string | null
  completed_at: string | null
  notes: string | null
  /** Date a generated session was planned for before it was moved. */
  moved_from: string | null
}

export interface SessionExercise {
  id: string
  session_id: string
  position: number
  exercise_id: string
  block: Block
  prescription: Prescription
  notes: string | null
  skipped: boolean
  template_item_id: string | null
}

export interface LoggedSet {
  id: string
  session_exercise_id: string
  set_number: number
  side: 'left' | 'right' | null
  is_warmup: boolean
  reps: number | null
  load_lb: number | null
  seconds: number | null
  distance_m: number | null
  contacts: number | null
  rpe: number | null
  hit_target: boolean | null
  note: string | null
  logged_at: string
}

export interface Feat {
  id: string
  slug: string
  name: string
  area: FeatArea
  stage: FeatStage
  target: string | null
  unlock: string | null
  rough_time: string | null
  notes: string | null
  position: number
  achieved_on: string | null
}

export interface FeatStep {
  id: string
  feat_id: string
  step_number: number
  description: string
  target: Record<string, unknown>
  is_goal: boolean
  is_bonus: boolean
  achieved_on: string | null
  /** How to do this step in a session. */
  how: string | null
}

export interface Milestone {
  id: string
  feat_id: string | null
  feat_step_id: string | null
  title: string
  achieved_on: string
  value: Record<string, unknown>
  session_id: string | null
  set_id: string | null
  note: string | null
}

export interface Media {
  id: string
  storage_path: string
  kind: 'photo' | 'video'
  taken_on: string
  caption: string | null
  tags: string[]
  session_id: string | null
  exercise_id: string | null
  feat_id: string | null
  milestone_id: string | null
}

export interface Metric {
  id: string
  kind: string
  exercise_id: string | null
  value: number
  unit: 'lb' | 'in' | 's' | 'm'
  measured_on: string
  note: string | null
}

export interface Change {
  id: string
  created_at: string
  author: ChangeAuthor
  summary: string
  reason: string | null
  affects_from: string | null
  details: Record<string, unknown>
}

/** Row of the feat_progress view: a feat with its current ladder step. */
export interface FeatProgress {
  id: string
  slug: string
  name: string
  area: FeatArea
  stage: FeatStage
  target: string | null
  achieved_on: string | null
  position: number
  steps_total: number
  steps_done: number
  current_step: number | null
  current_step_description: string | null
}

/** Whether a note has been dealt with (note_status). No row means the note is open. */
export interface NoteStatus {
  id: string
  source: 'session' | 'set' | 'milestone'
  source_id: string
  done_on: string | null
  response: string | null
}
