import { useEffect, useState } from 'react'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type AuthStatus = 'loading' | 'signed-in' | 'signed-out'

/** Where supabase-js keeps the login: sb-<project ref>-auth-token. */
function storageKey(): string | null {
  const url = import.meta.env.VITE_SUPABASE_URL
  if (!url) return null
  try {
    return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`
  } catch {
    return null
  }
}

/** A login is saved on this device (it may need renewing). */
export function hasSavedLogin(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): boolean {
  const key = storageKey()
  try {
    return Boolean(key && storage?.getItem(key))
  } catch {
    return false
  }
}

/**
 * Signed in, unless Supabase really signed us out. The access token lasts an
 * hour; reopening the app later renews it, and when that renewal can't reach
 * the server (no signal, phone still waking up) getSession reports no session
 * while the saved login is intact. Treat that as signed in: screens load from
 * their offline copies and supabase-js renews the token once it can. Only an
 * explicit sign-out, or the saved login being gone, shows the sign-in screen.
 */
export function authStatusFrom(
  session: Session | null,
  event: AuthChangeEvent | 'load',
  savedLogin: boolean,
): AuthStatus {
  if (session) return 'signed-in'
  if (event === 'SIGNED_OUT') return 'signed-out'
  return savedLogin ? 'signed-in' : 'signed-out'
}

export function useAuthStatus(): AuthStatus {
  // With a saved login, open the app straight away: renewing it can take a while
  // (supabase-js retries) when there's no signal, and the gym screen can't wait.
  const [status, setStatus] = useState<AuthStatus>(() =>
    !supabase ? 'signed-out' : hasSavedLogin() ? 'signed-in' : 'loading',
  )

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setStatus(authStatusFrom(data.session, 'load', hasSavedLogin())))
    const { data } = supabase.auth.onAuthStateChange((event, s) => setStatus(authStatusFrom(s, event, hasSavedLogin())))
    return () => data.subscription.unsubscribe()
  }, [])

  return status
}
