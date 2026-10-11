import { useState } from 'react'
import { DayView } from '../components/DayView'
import { formatDay, localISODate } from '../lib/dates'
import { supabase } from '../lib/supabase'

export function TodayScreen() {
  const [date] = useState(localISODate)
  return (
    <>
      <p className="text-sm text-neutral-500">{formatDay(date)}</p>
      {!supabase && <h1 className="text-2xl font-semibold">Today</h1>}
      <DayView date={date} />
    </>
  )
}
