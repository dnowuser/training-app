import { useRef, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { addDays, formatDay, localISODate } from '../lib/dates'

/**
 * The ‹ date › bar for Today and Day detail, and swiping between days: swipe left
 * for the next day, right for the day before. A swipe that starts on a set row (which
 * swipes to skip), a box or a panel's controls is left alone.
 */
export function DayNav({ date, children }: { date: string; children: ReactNode }) {
  const navigate = useNavigate()
  const today = localISODate()
  const start = useRef<{ x: number; y: number } | null>(null)
  const go = (d: string) => navigate(d === today ? '/' : `/day/${d}`)
  return (
    <div
      onTouchStart={(e) => {
        const el = e.target as HTMLElement
        start.current = el.closest('[data-no-day-swipe], input, select, textarea, [role="region"]')
          ? null
          : { x: e.touches[0].clientX, y: e.touches[0].clientY }
      }}
      onTouchEnd={(e) => {
        const s = start.current
        start.current = null
        if (!s) return
        const dx = e.changedTouches[0].clientX - s.x
        const dy = e.changedTouches[0].clientY - s.y
        if (Math.abs(dx) > 80 && Math.abs(dx) > 2 * Math.abs(dy)) go(addDays(date, dx < 0 ? 1 : -1))
      }}
    >
      <div className="flex items-center justify-between">
        <Link to={addDays(date, -1) === today ? '/' : `/day/${addDays(date, -1)}`} className="-ml-3 px-3 py-2 text-2xl" aria-label="Previous day">
          ‹
        </Link>
        <div className="text-center">
          <p className="font-medium">{formatDay(date)}</p>
          {date === today ? (
            <p className="text-xs text-neutral-500">Today</p>
          ) : (
            <Link to="/" className="text-xs text-emerald-700 underline dark:text-emerald-400">
              Back to today
            </Link>
          )}
        </div>
        <Link to={addDays(date, 1) === today ? '/' : `/day/${addDays(date, 1)}`} className="-mr-3 px-3 py-2 text-2xl" aria-label="Next day">
          ›
        </Link>
      </div>
      {children}
    </div>
  )
}
