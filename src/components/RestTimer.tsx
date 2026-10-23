import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { formatDuration } from '../lib/prescription'
import { RestTimerContext, useRestTimer, type RestTimer } from '../lib/restTimer'

const STORAGE_KEY = 'rest-timer'
const SOUND_KEY = 'rest-timer-sound'

function loadSound(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) === 'on'
  } catch {
    return false
  }
}

interface Stored {
  endsAt: number
  total: number
}

function load(): Stored | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const stored = raw ? (JSON.parse(raw) as Stored) : null
    return stored && stored.endsAt > Date.now() ? stored : null
  } catch {
    return null
  }
}

function save(stored: Stored | null) {
  try {
    if (stored) localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Private mode or storage blocked: the timer still runs, it just won't survive a reload.
  }
}

/** Holds the rest timer above the screens, so it keeps running when you switch tabs or reload. */
export function RestTimerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Stored | null>(load)
  const [sound, setSoundState] = useState(loadSound)
  const audio = useRef<AudioContext | null>(null)

  const update = useCallback((next: Stored | null) => {
    save(next)
    setState(next)
  }, [])

  // Never hold the phone's audio while the app is in the background.
  useEffect(() => {
    const onHide = () => document.hidden && void audio.current?.suspend().catch(() => undefined)
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [])

  const timer = useMemo<RestTimer>(
    () => ({
      endsAt: state?.endsAt ?? null,
      total: state?.total ?? 0,
      sound,
      setSound: (on) => {
        try {
          localStorage.setItem(SOUND_KEY, on ? 'on' : 'off')
        } catch {
          // Storage blocked: the choice lasts until the app closes.
        }
        if (on) unlock(audio)
        else {
          void audio.current?.close().catch(() => undefined)
          audio.current = null
        }
        setSoundState(on)
      },
      start: (seconds) => {
        // Unlocked inside the tap that logged the set, so iOS lets it beep later.
        if (sound) unlock(audio)
        update({ endsAt: Date.now() + seconds * 1000, total: seconds })
      },
      add: (seconds) =>
        state && update({ endsAt: Math.max(Date.now(), state.endsAt + seconds * 1000), total: state.total + seconds }),
      stop: () => update(null),
    }),
    [state, sound, update],
  )

  useEffect(() => {
    if (!state) return
    const ms = state.endsAt - Date.now()
    const done = () => {
      navigator.vibrate?.([200, 100, 200])
      if (sound) beep(audio.current)
      update(null)
    }
    const id = setTimeout(done, Math.max(0, ms))
    return () => clearTimeout(id)
  }, [state, sound, update])

  return <RestTimerContext.Provider value={timer}>{children}</RestTimerContext.Provider>
}

/**
 * Safari's Audio Session API: "ambient" plays the beep over music from other apps
 * instead of pausing it (the default "playback" stops Spotify). Older browsers skip it.
 */
function mixWithOtherAudio() {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
  if (session && session.type !== 'ambient') session.type = 'ambient'
}

/** Create the audio context in a tap, then let go of the audio session until the beep. */
function unlock(audio: { current: AudioContext | null }) {
  try {
    mixWithOtherAudio()
    audio.current ??= new AudioContext()
    const ctx = audio.current
    void ctx.resume().then(() => ctx.suspend()).catch(() => undefined)
  } catch {
    audio.current = null
  }
}

function beep(ctx: AudioContext | null) {
  if (!ctx) return
  try {
    mixWithOtherAudio()
    void ctx.resume()
    for (const at of [0, 0.25]) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.3, ctx.currentTime + at)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + 0.2)
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + at)
      osc.stop(ctx.currentTime + at + 0.2)
    }
    // Let go of the audio session between rests.
    setTimeout(() => void ctx.suspend().catch(() => undefined), 800)
  } catch {
    // No sound is fine; the bar still disappears.
  }
}

/** Countdown bar that sits just above the tab bar while you rest. */
export function RestTimerBar() {
  const { endsAt, total, add, stop, sound, setSound } = useRestTimer()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!endsAt) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [endsAt])

  if (!endsAt) return null
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000))
  const progress = total ? 1 - left / total : 1

  return (
    <div className="border-t border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900" role="timer">
      <div className="h-1 bg-emerald-500 transition-[width] duration-200" style={{ width: `${progress * 100}%` }} />
      <div className="mx-auto flex max-w-lg items-center gap-2 px-4 py-2">
        <span className="text-sm text-neutral-500">Rest</span>
        <span className="flex-1 text-3xl font-semibold tabular-nums">{formatDuration(left)}</span>
        <button
          type="button"
          onClick={() => setSound(!sound)}
          aria-label={sound ? 'Beep on: tap to turn off' : 'Beep off: tap to turn on'}
          aria-pressed={sound}
          className="h-12 w-10 rounded-xl text-xl text-neutral-500"
        >
          {sound ? '🔔' : '🔕'}
        </button>
        <button type="button" onClick={() => add(-15)} className="h-12 rounded-xl bg-neutral-100 px-3 font-medium dark:bg-neutral-800">
          −15
        </button>
        <button type="button" onClick={() => add(30)} className="h-12 rounded-xl bg-neutral-100 px-3 font-medium dark:bg-neutral-800">
          +30
        </button>
        <button type="button" onClick={stop} className="h-12 rounded-xl bg-neutral-900 px-4 font-semibold text-white dark:bg-white dark:text-neutral-900">
          Go
        </button>
      </div>
    </div>
  )
}
