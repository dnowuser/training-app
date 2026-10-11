/** A date in the device's time zone as YYYY-MM-DD. Sessions are keyed by local date. */
export function localISODate(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** "Mon, Oct 19" for a YYYY-MM-DD string, without time-zone drift. */
export function formatDay(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

/** Parse YYYY-MM-DD as a local date (midnight). */
export function parseISODate(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** YYYY-MM-DD plus n days, in local time. */
export function addDays(isoDate: string, n: number): string {
  const d = parseISODate(isoDate)
  d.setDate(d.getDate() + n)
  return localISODate(d)
}

/** Monday of the week containing the date (weeks run Monday to Sunday, like the plan). */
export function startOfWeek(isoDate: string): string {
  const day = parseISODate(isoDate).getDay() // 0 = Sunday
  return addDays(isoDate, -((day + 6) % 7))
}

/**
 * Days shown on a month calendar: whole weeks, Monday first, from the week
 * containing the 1st to the week containing the last day. month is YYYY-MM.
 */
export function monthGrid(month: string): string[] {
  const [y, m] = month.split('-').map(Number)
  const first = `${month}-01`
  const last = localISODate(new Date(y, m, 0))
  const days: string[] = []
  for (let d = startOfWeek(first); d <= last || days.length % 7 !== 0; d = addDays(d, 1)) days.push(d)
  return days
}

/** "October 2026" for YYYY-MM. */
export function formatMonth(month: string): string {
  return parseISODate(`${month}-01`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

/** YYYY-MM shifted by n months. */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  return localISODate(new Date(y, m - 1 + n, 1)).slice(0, 7)
}
