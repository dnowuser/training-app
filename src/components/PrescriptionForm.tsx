import { useState } from 'react'
import { describePrescription } from '../lib/prescription'
import { fromFormValues, NUMBER_FIELDS, toFormValues, type PrescriptionFormValues } from '../lib/prescriptionForm'
import type { Prescription } from '../lib/types'

const input =
  'h-11 w-full rounded-lg border border-neutral-300 bg-white px-3 dark:border-neutral-700 dark:bg-neutral-900'

/** Edit a prescription: the fields in use are shown, the rest behind "More fields". */
export function PrescriptionForm({
  initial,
  initialNotes = '',
  askReason = false,
  onSave,
  onCancel,
  saveLabel = 'Save',
}: {
  initial: Prescription
  initialNotes?: string
  askReason?: boolean
  onSave: (p: Prescription, notes: string, reason: string) => void | Promise<void>
  onCancel: () => void
  saveLabel?: string
}) {
  const [form, setForm] = useState<PrescriptionFormValues>(() => toFormValues(initial))
  const [notes, setNotes] = useState(initialNotes)
  const [reason, setReason] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // One save at a time, so a double tap doesn't save twice.
  const [saving, setSaving] = useState(false)

  const result = fromFormValues(form, initial)
  const visible = NUMBER_FIELDS.filter(([key]) => showAll || toFormValues(initial).numbers[key] !== '' || form.numbers[key] !== '')

  function submit() {
    if (typeof result === 'string') return setError(result)
    if (saving) return
    setSaving(true)
    void Promise.resolve(onSave(result, notes.trim(), reason.trim())).finally(() => setSaving(false))
  }

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.ladder} onChange={(e) => setForm({ ...form, ladder: e.target.checked })} />
        Heavy ladder off the training max
      </label>
      {form.ladder && (
        <>
          <label className="block text-sm">
            <span className="text-neutral-500">Warm-ups (% x reps)</span>
            <input className={input} value={form.warmups} onChange={(e) => setForm({ ...form, warmups: e.target.value })} />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-500">Work sets (% x reps)</span>
            <input className={input} value={form.steps} onChange={(e) => setForm({ ...form, steps: e.target.value })} />
          </label>
        </>
      )}
      <div className="grid grid-cols-2 gap-2">
        {visible.map(([key, label]) => (
          <label key={key} className="block text-sm">
            <span className="text-neutral-500">{label}</span>
            <input
              inputMode="decimal"
              className={input}
              value={form.numbers[key]}
              onChange={(e) => setForm({ ...form, numbers: { ...form.numbers, [key]: e.target.value } })}
            />
          </label>
        ))}
      </div>
      <button type="button" onClick={() => setShowAll(!showAll)} className="text-sm text-neutral-500 underline">
        {showAll ? 'Fewer fields' : 'More fields'}
      </button>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.perSide} onChange={(e) => setForm({ ...form, perSide: e.target.checked })} />
        Per side
      </label>
      <label className="block text-sm">
        <span className="text-neutral-500">Intensity (e.g. light, conversational)</span>
        <input className={input} value={form.intensity} onChange={(e) => setForm({ ...form, intensity: e.target.value })} />
      </label>
      <label className="block text-sm">
        <span className="text-neutral-500">Notes</span>
        <input className={input} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      {askReason && (
        <label className="block text-sm">
          <span className="text-neutral-500">Note for Claude (saved to your notes, optional)</span>
          <input className={input} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
      )}
      <p className="text-sm text-neutral-600 dark:text-neutral-300">
        {typeof result === 'string' ? result : describePrescription(result) || 'No target set'}
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="h-12 flex-1 rounded-xl bg-neutral-100 font-medium dark:bg-neutral-800">
          Cancel
        </button>
        <button type="button" onClick={submit} disabled={saving} className="h-12 flex-1 rounded-xl bg-emerald-600 font-semibold text-white disabled:opacity-60">
          {saving ? 'Saving…' : saveLabel}
        </button>
      </div>
    </div>
  )
}
