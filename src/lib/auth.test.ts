import { describe, expect, it } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import { authStatusFrom } from './auth'

const session = {} as Session

describe('authStatusFrom', () => {
  it('is signed in with a session', () => {
    expect(authStatusFrom(session, 'load', false)).toBe('signed-in')
  })

  it('stays signed in when renewal failed but the login is still saved', () => {
    expect(authStatusFrom(null, 'load', true)).toBe('signed-in')
    expect(authStatusFrom(null, 'INITIAL_SESSION', true)).toBe('signed-in')
  })

  it('signs out on an explicit sign-out or when nothing is saved', () => {
    expect(authStatusFrom(null, 'SIGNED_OUT', true)).toBe('signed-out')
    expect(authStatusFrom(null, 'load', false)).toBe('signed-out')
  })
})
