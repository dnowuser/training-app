import { createContext, useContext } from 'react'

export interface RestTimer {
  /** Epoch ms when the rest ends, or null when no timer is running. */
  endsAt: number | null
  /** Length of the current rest in seconds, for the progress bar. */
  total: number
  start: (seconds: number) => void
  add: (seconds: number) => void
  stop: () => void
  /** Beep when the rest ends. Off by default: on iPhone the beep can pause music from other apps. */
  sound: boolean
  setSound: (on: boolean) => void
}

export const RestTimerContext = createContext<RestTimer | null>(null)

export function useRestTimer(): RestTimer {
  const timer = useContext(RestTimerContext)
  if (!timer) throw new Error('useRestTimer needs a RestTimerProvider')
  return timer
}
