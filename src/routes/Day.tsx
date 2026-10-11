import { Link, useParams } from 'react-router'
import { DayView } from '../components/DayView'
import { addDays, formatDay, localISODate } from '../lib/dates'

/** Any past or future day: plan vs what was logged, with the same logging and editing as Today. */
export function DayScreen() {
  const { date = localISODate() } = useParams()
  const today = localISODate()
  return (
    <>
      <div className="flex items-center justify-between">
        <Link to={`/day/${addDays(date, -1)}`} className="px-3 py-2 text-xl" aria-label="Previous day">
          ‹
        </Link>
        <div className="text-center">
          <p className="font-medium">{formatDay(date)}</p>
          <p className="text-xs text-neutral-500">
            {date === today ? 'Today' : date < today ? 'Past day' : 'Planned'} ·{' '}
            <Link to={`/calendar?month=${date.slice(0, 7)}`} className="underline">
              Calendar
            </Link>
          </p>
        </div>
        <Link to={`/day/${addDays(date, 1)}`} className="px-3 py-2 text-xl" aria-label="Next day">
          ›
        </Link>
      </div>
      <DayView key={date} date={date} />
    </>
  )
}
