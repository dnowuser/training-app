import { useParams } from 'react-router'
import { DayNav } from '../components/DayNav'
import { DayView } from '../components/DayView'
import { localISODate } from '../lib/dates'

/** Any past or future day: plan vs what was logged, with the same logging and editing as Today. */
export function DayScreen() {
  const { date = localISODate() } = useParams()
  return (
    <DayNav date={date}>
      <DayView key={date} date={date} />
    </DayNav>
  )
}
