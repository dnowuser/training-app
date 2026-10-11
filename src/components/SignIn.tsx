import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

const input =
  'w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-lg dark:border-neutral-700 dark:bg-neutral-900'
const button = 'w-full rounded-xl bg-neutral-900 py-3 text-lg font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900'

/**
 * Email sign-in with a one-time code. The email carries both a link (works in the
 * browser) and a 6-digit code (needed in the home-screen app, where links open
 * in the browser instead). New sign-ups are refused: the account is created once
 * in the Supabase dashboard.
 */
export function SignIn() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!supabase) return null
  const auth = supabase.auth

  async function send(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false, emailRedirectTo: window.location.origin },
    })
    setBusy(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  async function verify(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) setError(error.message)
  }

  return (
    <section className="flex min-h-[70dvh] flex-col justify-center gap-6">
      <h1 className="text-3xl font-semibold">Training</h1>
      {!sent ? (
        <form onSubmit={send} className="flex flex-col gap-3">
          <label htmlFor="email" className="text-sm text-neutral-500">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={input}
          />
          <button type="submit" disabled={busy || !email} className={button}>
            {busy ? 'Sending…' : 'Email me a sign-in code'}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="flex flex-col gap-3">
          <p className="text-neutral-600 dark:text-neutral-300">
            Sent to {email}. Tap the link in the email, or enter the code here.
          </p>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="Code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={`${input} text-center tracking-[0.4em]`}
          />
          <button type="submit" disabled={busy || code.trim().length < 6} className={button}>
            {busy ? 'Checking…' : 'Sign in'}
          </button>
          <button type="button" onClick={() => setSent(false)} className="py-2 text-sm text-neutral-500 underline">
            Use a different email
          </button>
        </form>
      )}
      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </section>
  )
}
