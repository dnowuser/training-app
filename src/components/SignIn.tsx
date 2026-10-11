import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

const input =
  'w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-lg dark:border-neutral-700 dark:bg-neutral-900'

/**
 * Email and password sign-in. Works the same in the browser and the home-screen
 * app, and needs no email setup. New sign-ups are off: the account is created
 * once in the Supabase dashboard.
 */
export function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!supabase) return null
  const auth = supabase.auth

  async function signIn(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setError(error.message)
  }

  return (
    <section className="flex min-h-[70dvh] flex-col justify-center gap-6">
      <h1 className="text-3xl font-semibold">Training</h1>
      <form onSubmit={signIn} className="flex flex-col gap-3">
        <input
          type="email"
          autoComplete="email"
          placeholder="Email"
          aria-label="Email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={input}
        />
        <input
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          aria-label="Password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={input}
        />
        <button
          type="submit"
          disabled={busy || !email || !password}
          className="w-full rounded-xl bg-neutral-900 py-3 text-lg font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </section>
  )
}
