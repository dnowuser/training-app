import { useState } from 'react'
import { DayNav } from '../components/DayNav'
import { DayView } from '../components/DayView'
import { localISODate } from '../lib/dates'
import { supabase } from '../lib/supabase'

export function TodayScreen() {
  const [date] = useState(localISODate)
  return (
    <DayNav date={date}>
      {!supabase && <h1 className="text-2xl font-semibold">Today</h1>}
      <DayView date={date} />
    </DayNav>
  )
}
