import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { UploadButton, MediaGallery } from '../components/MediaGallery'
import { formatDay, localISODate } from '../lib/dates'
import { addMilestone, currentStep, loadFeat, loadFeats, markStep, setStage, unmarkStep, type FeatDetail } from '../lib/feats'
import { uploadMedia } from '../lib/media'
import { supabase } from '../lib/supabase'
import type { FeatProgress, FeatStage, FeatStep } from '../lib/types'

const STAGES: { stage: FeatStage; title: string; hint: string }[] = [
  { stage: 'now', title: 'Now', hint: 'Fully trained this cycle' },
  { stage: 'next', title: 'Next', hint: 'Unlocks when its condition is met' },
  { stage: 'background', title: 'Background', hint: 'Rides along in mobility work' },
  { stage: 'achieved', title: 'Achieved', hint: 'Done; kept at maintenance' },
]

const AREA_COLOR: Record<string, string> = {
  lifting: 'bg-red-500/15 text-red-700 dark:text-red-300',
  jumping: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  running: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  calisthenics: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  mobility: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
}

export function FeatsScreen() {
  const [feats, setFeats] = useState<FeatProgress[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    loadFeats(supabase).then(setFeats, (e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  return (
    <section>
      <h1 className="text-2xl font-semibold">Feats</h1>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {!feats && !error && supabase && <p className="mt-4 text-neutral-500">Loading…</p>}
      {feats &&
        STAGES.map(({ stage, title, hint }) => {
          const list = feats.filter((f) => f.stage === stage)
          if (!list.length) return null
          return (
            <div key={stage} className="mt-6">
              <h2 className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
                {title} · {list.length}
              </h2>
              <p className="text-xs text-neutral-500">{hint}</p>
              <ul className="mt-2 space-y-2">
                {list.map((f) => (
                  <li key={f.id}>
                    <FeatCard feat={f} />
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
    </section>
  )
}

function FeatCard({ feat }: { feat: FeatProgress }) {
  const pct = feat.steps_total ? (feat.steps_done / feat.steps_total) * 100 : 0
  return (
    <Link
      to={`/feats/${feat.slug}`}
      className="block rounded-2xl border border-neutral-200 bg-white p-4 active:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-lg font-semibold">{feat.name}</span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs capitalize ${AREA_COLOR[feat.area] ?? ''}`}>{feat.area}</span>
      </div>
      {feat.achieved_on ? (
        <p className="text-sm text-emerald-600">Achieved {formatDay(feat.achieved_on)}</p>
      ) : feat.current_step_description ? (
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          Step {feat.current_step} of {feat.steps_total}: {feat.current_step_description}
        </p>
      ) : (
        <p className="text-sm text-neutral-500">{feat.target}</p>
      )}
      {feat.steps_total > 1 && (
        <div className="mt-2 flex gap-1">
          {Array.from({ length: feat.steps_total }, (_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full ${i < feat.steps_done ? 'bg-emerald-500' : 'bg-neutral-200 dark:bg-neutral-800'}`}
            />
          ))}
        </div>
      )}
      {feat.steps_total <= 1 && pct > 0 && <div className="mt-2 h-1.5 rounded-full bg-emerald-500" />}
    </Link>
  )
}

export function FeatDetailScreen() {
  const { slug = '' } = useParams()
  const [detail, setDetail] = useState<FeatDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [marking, setMarking] = useState<FeatStep | null>(null)
  const [version, setVersion] = useState(0)
  const reload = () => setVersion((v) => v + 1)

  useEffect(() => {
    if (!supabase) return
    loadFeat(supabase, slug).then(setDetail, (e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [slug, version])

  if (!detail) return <p className="text-neutral-500">{error ?? 'Loading…'}</p>
  const { feat, steps, milestones } = detail
  const current = currentStep(steps)
  const report = (e: unknown) => setError(e instanceof Error ? e.message : String(e))

  async function undo(step: FeatStep) {
    if (!window.confirm(`Unmark "${step.description}"? Its milestone is removed too.`)) return
    try {
      await unmarkStep(supabase!, feat, step)
      reload()
    } catch (e) {
      report(e)
    }
  }

  async function changeStage(stage: FeatStage) {
    try {
      await setStage(supabase!, feat, stage)
      reload()
    } catch (e) {
      report(e)
    }
  }

  return (
    <section>
      <Link to="/feats" className="text-sm text-neutral-500">
        ‹ Feats
      </Link>
      <h1 className="mt-1 text-2xl font-semibold">{feat.name}</h1>
      {feat.target && <p className="text-neutral-600 dark:text-neutral-300">{feat.target}</p>}
      <div className="mt-2 flex flex-wrap gap-2 text-sm">
        <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${AREA_COLOR[feat.area] ?? ''}`}>{feat.area}</span>
        {feat.rough_time && <span className="text-xs text-neutral-500">Rough time: {feat.rough_time}</span>}
      </div>
      {feat.unlock && <p className="mt-2 text-sm">Unlocks when: {feat.unlock}</p>}
      {feat.notes && <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">{feat.notes}</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <label className="mt-4 flex items-center gap-2 text-sm">
        Stage
        <select
          value={feat.stage}
          onChange={(e) => void changeStage(e.target.value as FeatStage)}
          className="h-10 rounded-lg border border-neutral-300 bg-white px-2 dark:border-neutral-700 dark:bg-neutral-900"
        >
          {STAGES.map((s) => (
            <option key={s.stage} value={s.stage}>
              {s.title}
            </option>
          ))}
        </select>
      </label>

      <h2 className="mt-6 text-xs font-semibold tracking-wide text-neutral-500 uppercase">Ladder</h2>
      <ol className="mt-2 space-y-2">
        {steps.map((step) => (
          <li
            key={step.id}
            className={`rounded-xl border p-3 ${step.id === current?.id ? 'border-emerald-500 bg-emerald-500/5' : 'border-neutral-200 dark:border-neutral-800'}`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm ${step.achieved_on ? 'bg-emerald-600 text-white' : 'border border-neutral-300 dark:border-neutral-700'}`}
              >
                {step.achieved_on ? '✓' : step.step_number}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block ${step.is_goal ? 'font-semibold' : ''}`}>
                  {step.description}
                  {step.is_bonus && <span className="ml-1 text-xs text-neutral-500">(bonus)</span>}
                </span>
                {step.achieved_on && <span className="block text-xs text-emerald-600">Hit {formatDay(step.achieved_on)}</span>}
              </span>
              {step.achieved_on ? (
                <button type="button" onClick={() => void undo(step)} className="text-xs text-neutral-500 underline">
                  Undo
                </button>
              ) : (
                step.id === current?.id && (
                  <button
                    type="button"
                    onClick={() => setMarking(step)}
                    className="h-10 shrink-0 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white"
                  >
                    Hit it
                  </button>
                )
              )}
            </div>
            {marking?.id === step.id && (
              <MarkStepForm
                onCancel={() => setMarking(null)}
                onSave={async (date, note, files) => {
                  try {
                    const m = await markStep(supabase!, feat, step, date, note)
                    for (const f of files) await uploadMedia(supabase!, f, { feat_id: feat.id, milestone_id: m.id }, { takenOn: date })
                    setMarking(null)
                    reload()
                  } catch (e) {
                    report(e)
                  }
                }}
              />
            )}
          </li>
        ))}
      </ol>

      <h2 className="mt-6 text-xs font-semibold tracking-wide text-neutral-500 uppercase">Milestones</h2>
      <ResultForm
        onSave={async (title, date, note) => {
          try {
            await addMilestone(supabase!, feat, title, date, note)
            reload()
          } catch (e) {
            report(e)
          }
        }}
      />
      {milestones.length ? (
        <ul className="mt-2 space-y-2">
          {milestones.map((m) => (
            <li key={m.id} className="text-sm">
              <span className="font-medium">{m.title}</span>
              <span className="block text-xs text-neutral-500">
                {formatDay(m.achieved_on)}
                {m.note ? ` · ${m.note}` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-neutral-500">None yet.</p>
      )}

      <div className="mt-6">
        <MediaGallery key={version} filter={{ feat_id: feat.id }} />
      </div>
    </section>
  )
}

const field = 'h-11 w-full rounded-lg border border-neutral-300 bg-white px-3 dark:border-neutral-700 dark:bg-neutral-900'

function MarkStepForm({ onSave, onCancel }: { onSave: (date: string, note: string, files: File[]) => Promise<void>; onCancel: () => void }) {
  const [date, setDate] = useState(localISODate)
  const [note, setNote] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  return (
    <div className="mt-3 space-y-2">
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className={field} />
      <div className="flex items-center gap-2 text-sm">
        <UploadButton busy={false} label={files.length ? `${files.length} attached` : 'Attach photo or clip'} onFiles={(f) => setFiles(f ? Array.from(f) : [])} />
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="h-12 flex-1 rounded-xl bg-neutral-100 dark:bg-neutral-800">
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            await onSave(date, note.trim(), files)
            setBusy(false)
          }}
          className="h-12 flex-1 rounded-xl bg-emerald-600 font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

function ResultForm({ onSave }: { onSave: (title: string, date: string, note: string) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(localISODate)
  const [note, setNote] = useState('')
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-1 text-sm underline">
        Log a result (PR, time trial…)
      </button>
    )
  return (
    <div className="mt-2 space-y-2">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Mile time trial 6:41" className={field} />
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className={field} />
      <div className="flex gap-2">
        <button type="button" onClick={() => setOpen(false)} className="h-11 flex-1 rounded-xl bg-neutral-100 dark:bg-neutral-800">
          Cancel
        </button>
        <button
          type="button"
          disabled={!title.trim()}
          onClick={async () => {
            await onSave(title.trim(), date, note.trim())
            setOpen(false)
            setTitle('')
            setNote('')
          }}
          className="h-11 flex-1 rounded-xl bg-emerald-600 font-semibold text-white disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  )
}
